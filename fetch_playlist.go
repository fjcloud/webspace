package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"time"
)

type Video struct {
	ID        string `json:"id"`
	Duration  int    `json:"duration"`  // Duration in seconds
	StartTime int    `json:"start_time"` // Start time in seconds from midnight UTC
}

type Playlist struct {
	Videos []Video `json:"videos"`
}

func main() {
	playlistURL := "https://www.youtube.com/playlist?list=PLBFa2yUBFRr5Qb-ZQVjMdXbTDJRI7NPrh"
	videoIDs, err := getUniqueVideoIDsFromPlaylist(playlistURL)
	if err != nil {
		log.Fatalf("Error getting video IDs: %v", err)
	}

	videos, err := getVideoDetails(videoIDs)
	if err != nil {
		log.Fatalf("Error getting video details: %v", err)
	}

	calculateStartTimes(videos)

	playlist := Playlist{Videos: videos}
	jsonData, err := json.MarshalIndent(playlist, "", "  ")
	if err != nil {
		log.Fatalf("Error marshaling JSON: %v", err)
	}

	err = ioutil.WriteFile("docs/playlist.json", jsonData, 0644)
	if err != nil {
		log.Fatalf("Error writing JSON file: %v", err)
	}

	fmt.Printf("Updated playlist with %d embeddable video details has been stored in playlist.json\n", len(videos))
}

func getUniqueVideoIDsFromPlaylist(playlistURL string) ([]string, error) {
	resp, err := http.Get(playlistURL)
	if err != nil {
		return nil, fmt.Errorf("error fetching playlist: %v", err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %v", err)
	}

	content := string(body)
	videoIDRegex := regexp.MustCompile(`"videoId":"([^"]+)"`)
	matches := videoIDRegex.FindAllStringSubmatch(content, -1)

	uniqueVideoIDs := make(map[string]bool)
	for _, match := range matches {
		if len(match) > 1 {
			uniqueVideoIDs[match[1]] = true
		}
	}

	var videoIDs []string
	for id := range uniqueVideoIDs {
		videoIDs = append(videoIDs, id)
	}

	return videoIDs, nil
}

func getVideoDetails(videoIDs []string) ([]Video, error) {
	var videos []Video
	client := &http.Client{Timeout: 10 * time.Second}

	for _, id := range videoIDs {
		if isEmbeddable(id, client) {
			videoURL := fmt.Sprintf("https://www.youtube.com/watch?v=%s", id)
			resp, err := client.Get(videoURL)
			if err != nil {
				fmt.Printf("Error fetching video %s: %v. Skipping.\n", id, err)
				continue
			}
			defer resp.Body.Close()

			body, err := ioutil.ReadAll(resp.Body)
			if err != nil {
				fmt.Printf("Error reading response body for video %s: %v. Skipping.\n", id, err)
				continue
			}

			content := string(body)

			durationRegex := regexp.MustCompile(`"lengthSeconds":"(\d+)"`)
			match := durationRegex.FindStringSubmatch(content)

			if len(match) > 1 {
				duration, err := strconv.Atoi(match[1])
				if err != nil {
					fmt.Printf("Error parsing duration for video %s: %v. Skipping.\n", id, err)
					continue
				}

				videos = append(videos, Video{
					ID:       id,
					Duration: duration,
				})
				fmt.Printf("Added video %s with duration %d seconds.\n", id, duration)
			} else {
				fmt.Printf("Could not find duration for video %s. Skipping.\n", id)
			}
		} else {
			fmt.Printf("Video %s is not embeddable. Skipping.\n", id)
		}
	}

	return videos, nil
}

func isEmbeddable(videoID string, client *http.Client) bool {
	oembedURL := fmt.Sprintf("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=%s&format=json", videoID)
	resp, err := client.Get(oembedURL)
	if err != nil {
		fmt.Printf("Error checking embeddability for video %s: %v\n", videoID, err)
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

func calculateStartTimes(videos []Video) {
	totalDuration := 0
	for _, video := range videos {
		totalDuration += video.Duration
	}

	secondsInDay := 24 * 60 * 60
	scaleFactor := float64(secondsInDay) / float64(totalDuration)

	currentStartTime := 0
	for i := range videos {
		videos[i].StartTime = currentStartTime
		currentStartTime += int(float64(videos[i].Duration) * scaleFactor)
	}
}
