let playlist = [];
let currentVideoIndex = 0;
let audioPlayer;

async function loadPlaylist() {
    try {
        const response = await fetch('playlist.json');
        const data = await response.json();
        playlist = data.video_ids;
        console.log('Playlist loaded:', playlist);
    } catch (error) {
        console.error('Error loading playlist:', error);
    }
}

function initializePlayer() {
    const videoContainer = document.querySelector('.video-container');
    loadVideo(videoContainer, playlist[currentVideoIndex]);

    window.addEventListener('message', (event) => {
        if (event.data && event.data.info === 'endVideoPlaying') {
            playNextVideo();
        }
    });
}

function loadVideo(container, videoId) {
    // Remove any existing iframe
    const existingIframe = container.querySelector('iframe');
    if (existingIframe) {
        existingIframe.remove();
    }

    // Create a new iframe
    const iframe = document.createElement('iframe');
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;

    const embedUrl = new URL('https://cdpn.io/pen/debug/oNPzxKo');
    embedUrl.searchParams.set('v', videoId);
    embedUrl.searchParams.set('autoplay', '1');
    embedUrl.searchParams.set('controls', '0');
    embedUrl.searchParams.set('mute', '1');
    embedUrl.searchParams.set('modestbranding', '1');
    embedUrl.searchParams.set('rel', '0');
    embedUrl.searchParams.set('showinfo', '0');
    embedUrl.searchParams.set('iv_load_policy', '3');
    embedUrl.searchParams.set('playsinline', '1');
    embedUrl.searchParams.set('enablejsapi', '1');

    iframe.src = embedUrl.toString();

    // Set iframe styles
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';

    // Append the new iframe to the container
    container.appendChild(iframe);
}

function playNextVideo() {
    currentVideoIndex = (currentVideoIndex + 1) % playlist.length;
    const videoContainer = document.querySelector('.video-container');
    loadVideo(videoContainer, playlist[currentVideoIndex]);
}

function setupAudioPlayer() {
    audioPlayer = new Audio('http://pbbradio.com:8001/128');
    audioPlayer.volume = 0.5;
}

function startAudio() {
    audioPlayer.play().catch(error => {
        console.log('Audio playback failed:', error);
    });
}

function toggleAudio() {
    if (audioPlayer.paused) {
        audioPlayer.play().catch(error => {
            console.log('Audio playback failed:', error);
        });
    } else {
        audioPlayer.pause();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadPlaylist();
    setupAudioPlayer();

    const startButton = document.getElementById('start-button');
    startButton.addEventListener('click', () => {
        initializePlayer();
        startAudio();
        startButton.style.display = 'none';
    });

    document.addEventListener('keydown', function(event) {
        if (event.code === 'Space') {
            toggleAudio();
            event.preventDefault();
        }
    });
});
