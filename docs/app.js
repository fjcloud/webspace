let playlist = [];
let currentVideoIndex = 0;
let audioPlayer;

async function loadPlaylist() {
    try {
        const response = await fetch('playlist.json');
        const data = await response.json();
        playlist = data.videos;
        console.log('Playlist loaded:', playlist);
    } catch (error) {
        console.error('Error loading playlist:', error);
    }
}

function initializePlayer() {
    synchronizePlayback();

    window.addEventListener('message', (event) => {
        if (event.data && event.data.info === 'endVideoPlaying') {
            playNextVideo();
        }
    });
}

function synchronizePlayback() {
    const now = new Date();
    const secondsSinceMidnightUTC = (now.getUTCHours() * 3600) + (now.getUTCMinutes() * 60) + now.getUTCSeconds();

    let videoToPlay = playlist[0];
    for (let i = 0; i < playlist.length; i++) {
        if (secondsSinceMidnightUTC >= playlist[i].start_time) {
            videoToPlay = playlist[i];
            currentVideoIndex = i;
        } else {
            break;
        }
    }

    const secondsIntoVideo = secondsSinceMidnightUTC - videoToPlay.start_time;
    
    const videoContainer = document.querySelector('.video-container');
    loadVideo(videoContainer, videoToPlay.id, secondsIntoVideo);
}

function loadVideo(container, videoId, startTime = 0) {
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
    embedUrl.searchParams.set('start', Math.floor(startTime).toString());

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
    loadVideo(videoContainer, playlist[currentVideoIndex].id);
}

function setupAudioPlayer() {
    if (Hls.isSupported()) {
        audioPlayer = new Hls();
        audioPlayer.loadSource('https://stream.nightride.fm:8443/ebsm/ebsm.m3u8');
        audioPlayer.attachMedia(document.createElement('audio'));
        audioPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
            console.log('HLS manifest loaded');
        });
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audioPlayer = document.createElement('audio');
        audioPlayer.src = 'https://stream.nightride.fm:8443/ebsm/ebsm.m3u8';
        audioPlayer.addEventListener('loadedmetadata', function() {
            console.log('HLS audio loaded');
        });
    } else {
        console.error('HLS is not supported on this browser');
    }
}

function startAudio() {
    if (audioPlayer instanceof Hls) {
        audioPlayer.media.play().catch(error => {
            console.log('Audio playback failed:', error);
        });
    } else if (audioPlayer instanceof HTMLAudioElement) {
        audioPlayer.play().catch(error => {
            console.log('Audio playback failed:', error);
        });
    }
}

function toggleAudio() {
    if (audioPlayer instanceof Hls) {
        if (audioPlayer.media.paused) {
            audioPlayer.media.play().catch(error => {
                console.log('Audio playback failed:', error);
            });
        } else {
            audioPlayer.media.pause();
        }
    } else if (audioPlayer instanceof HTMLAudioElement) {
        if (audioPlayer.paused) {
            audioPlayer.play().catch(error => {
                console.log('Audio playback failed:', error);
            });
        } else {
            audioPlayer.pause();
        }
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
