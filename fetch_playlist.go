package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"regexp"
)

type Playlist struct {
	VideoIDs []string `json:"video_ids"`
}

func main() {
	playlistURL := "https://www.youtube.com/playlist?list=PLsPSzW_LUV5EywBUnErba6ZNynjsdr99t"
	videoIDs, err := getUniqueVideoIDsFromPlaylist(playlistURL)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	playlist := Playlist{VideoIDs: videoIDs}
	jsonData, err := json.MarshalIndent(playlist, "", "  ")
	if err != nil {
		fmt.Println("Error marshaling JSON:", err)
		return
	}

	err = ioutil.WriteFile("docs/playlist.json", jsonData, 0644)
	if err != nil {
		fmt.Println("Error writing JSON file:", err)
		return
	}

	fmt.Println("Unique playlist video IDs have been stored in docs/playlist.json")
}

func getUniqueVideoIDsFromPlaylist(playlistURL string) ([]string, error) {
	resp, err := http.Get(playlistURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
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
