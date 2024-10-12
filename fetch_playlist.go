package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Video struct {
	ID        string `json:"id"`
	Duration  int    `json:"duration"`  // Duration in seconds
	StartTime int    `json:"start_time"` // Start time in seconds
}

type Playlist struct {
	Videos []Video `json:"videos"`
}

type PlaylistItemsResponse struct {
	Items []struct {
		ContentDetails struct {
			VideoID string `json:"videoId"`
		} `json:"contentDetails"`
	} `json:"items"`
	NextPageToken string `json:"nextPageToken"`
}

type VideoDetailsResponse struct {
	Items []struct {
		ContentDetails struct {
			Duration string `json:"duration"`
		} `json:"contentDetails"`
		Status struct {
			Embeddable bool `json:"embeddable"`
		} `json:"status"`
	} `json:"items"`
}

const (
	youtubeAPIBaseURL = "https://www.googleapis.com/youtube/v3"
)

func main() {
	apiKey := os.Getenv("YT_API_KEY")
	if apiKey == "" {
		log.Fatal("YT_API_KEY environment variable is not set")
	}

	playlistIDs := strings.Split(os.Getenv("YT_PLAYLISTS"), ",")
	if len(playlistIDs) == 0 || playlistIDs[0] == "" {
		log.Fatal("YT_PLAYLISTS environment variable is not set or is empty")
	}

	var allVideos []Video

	for _, playlistID := range playlistIDs {
		videos, err := getPlaylistItems(playlistID, apiKey)
		if err != nil {
			log.Printf("Error getting videos for playlist %s: %v", playlistID, err)
			continue
		}
		allVideos = append(allVideos, videos...)
	}

	calculateStartTimes(allVideos)

	playlist := Playlist{Videos: allVideos}
	jsonData, err := json.MarshalIndent(playlist, "", "  ")
	if err != nil {
		log.Fatalf("Error marshaling JSON: %v", err)
	}

	err = ioutil.WriteFile("docs/playlist.json", jsonData, 0644)
	if err != nil {
		log.Fatalf("Error writing JSON file: %v", err)
	}

	fmt.Printf("Updated playlist with %d video details has been stored in playlist.json\n", len(allVideos))
}

func getPlaylistItems(playlistID, apiKey string) ([]Video, error) {
	var videos []Video
	pageToken := ""

	for {
		u, _ := url.Parse(youtubeAPIBaseURL + "/playlistItems")
		q := u.Query()
		q.Set("part", "contentDetails")
		q.Set("playlistId", playlistID)
		q.Set("maxResults", "50")
		q.Set("key", apiKey)
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		u.RawQuery = q.Encode()

		resp, err := http.Get(u.String())
		if err != nil {
			return nil, fmt.Errorf("error fetching playlist items: %v", err)
		}
		defer resp.Body.Close()

		body, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("error reading response body: %v", err)
		}

		// Check if the response is not JSON
		if !json.Valid(body) {
			return nil, fmt.Errorf("invalid JSON response: %s", string(body))
		}

		var playlistResp PlaylistItemsResponse
		err = json.Unmarshal(body, &playlistResp)
		if err != nil {
			return nil, fmt.Errorf("error unmarshaling response: %v\nResponse body: %s", err, string(body))
		}

		for _, item := range playlistResp.Items {
			video, err := getVideoDetails(item.ContentDetails.VideoID, apiKey)
			if err != nil {
				log.Printf("Error getting details for video %s: %v. Skipping.", item.ContentDetails.VideoID, err)
				continue
			}

			if video != nil {
				videos = append(videos, *video)
				fmt.Printf("Added video %s with duration %d seconds.\n", video.ID, video.Duration)
			} else {
				fmt.Printf("Skipped video %s (doesn't meet requirements)\n", item.ContentDetails.VideoID)
			}
		}

		pageToken = playlistResp.NextPageToken
		if pageToken == "" {
			break
		}
	}

	return videos, nil
}

func getVideoDetails(videoID, apiKey string) (*Video, error) {
	u, _ := url.Parse(youtubeAPIBaseURL + "/videos")
	q := u.Query()
	q.Set("part", "contentDetails,status")
	q.Set("id", videoID)
	q.Set("key", apiKey)
	u.RawQuery = q.Encode()

	resp, err := http.Get(u.String())
	if err != nil {
		return nil, fmt.Errorf("error fetching video details: %v", err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %v", err)
	}

	// Check if the response is not JSON
	if !json.Valid(body) {
		return nil, fmt.Errorf("invalid JSON response: %s", string(body))
	}

	var videoResp VideoDetailsResponse
	err = json.Unmarshal(body, &videoResp)
	if err != nil {
		return nil, fmt.Errorf("error unmarshaling response: %v\nResponse body: %s", err, string(body))
	}

	if len(videoResp.Items) == 0 {
		return nil, fmt.Errorf("no video found with ID %s", videoID)
	}

	item := videoResp.Items[0]
	duration, err := parseDuration(item.ContentDetails.Duration)
	if err != nil {
		return nil, fmt.Errorf("error parsing duration: %v", err)
	}

	isEmbeddable := item.Status.Embeddable

	// We can't directly check for 1080p+ with this API call
	// Assuming all videos are at least 1080p for simplicity
	has1080pPlus := true

	if !has1080pPlus || !isEmbeddable {
		return nil, nil // Return nil if the video doesn't meet requirements
	}

	return &Video{
		ID:       videoID,
		Duration: duration,
	}, nil
}

func parseDuration(duration string) (int, error) {
	duration = strings.TrimPrefix(duration, "PT")
	seconds := 0
	var number string
	for _, char := range duration {
		switch char {
		case 'H':
			hours, _ := strconv.Atoi(number)
			seconds += hours * 3600
			number = ""
		case 'M':
			minutes, _ := strconv.Atoi(number)
			seconds += minutes * 60
			number = ""
		case 'S':
			s, _ := strconv.Atoi(number)
			seconds += s
			number = ""
		default:
			number += string(char)
		}
	}
	return seconds, nil
}

func calculateStartTimes(videos []Video) {
	currentStartTime := 0
	for i := range videos {
		videos[i].StartTime = currentStartTime
		if i < len(videos)-1 {
			currentStartTime += videos[i].Duration
		}
	}
}
