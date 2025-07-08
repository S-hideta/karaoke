class KaraokeApp {
    constructor() {
        this.audioPlayer = document.getElementById('audio-player');
        this.isPlaying = false;
        this.isPracticeMode = false;
        this.isRecording = false;
        this.lyrics = [];
        this.currentLineIndex = 0;
        this.recordedChunks = [];
        this.mediaRecorder = null;
        this.recordedBlob = null;
        this.practiceTimer = null;
        this.currentPracticeStep = 'waiting'; // waiting, playing, recording, playback
        
        this.initializeElements();
        this.setupEventListeners();
        this.requestMicrophonePermission();
    }
    
    initializeElements() {
        this.elements = {
            audioFile: document.getElementById('audio-file'),
            playBtn: document.getElementById('play-btn'),
            pauseBtn: document.getElementById('pause-btn'),
            stopBtn: document.getElementById('stop-btn'),
            progress: document.getElementById('progress'),
            currentTime: document.getElementById('current-time'),
            totalTime: document.getElementById('total-time'),
            songTitle: document.getElementById('song-title'),
            lyricsInput: document.getElementById('lyrics-input'),
            setLyricsBtn: document.getElementById('set-lyrics-btn'),
            lyricsDisplay: document.getElementById('lyrics-display'),
            startPracticeBtn: document.getElementById('start-practice-btn'),
            stopPracticeBtn: document.getElementById('stop-practice-btn'),
            practiceStatusText: document.getElementById('practice-status-text'),
            recordBtn: document.getElementById('record-btn'),
            stopRecordBtn: document.getElementById('stop-record-btn'),
            playRecordBtn: document.getElementById('play-record-btn'),
            recordingStatusText: document.getElementById('recording-status-text')
        };
    }
    
    setupEventListeners() {
        // Audio file selection
        this.elements.audioFile.addEventListener('change', (e) => this.loadAudioFile(e));
        
        // Audio controls
        this.elements.playBtn.addEventListener('click', () => this.playAudio());
        this.elements.pauseBtn.addEventListener('click', () => this.pauseAudio());
        this.elements.stopBtn.addEventListener('click', () => this.stopAudio());
        
        // Audio player events
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateTimeDisplay());
        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
        this.audioPlayer.addEventListener('ended', () => this.handleAudioEnded());
        
        // Lyrics
        this.elements.setLyricsBtn.addEventListener('click', () => this.setLyrics());
        
        // Practice mode
        this.elements.startPracticeBtn.addEventListener('click', () => this.startPractice());
        this.elements.stopPracticeBtn.addEventListener('click', () => this.stopPractice());
        
        // Recording
        this.elements.recordBtn.addEventListener('click', () => this.startRecording());
        this.elements.stopRecordBtn.addEventListener('click', () => this.stopRecording());
        this.elements.playRecordBtn.addEventListener('click', () => this.playRecording());
    }
    
    async requestMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            this.elements.recordingStatusText.textContent = '録音準備完了';
        } catch (error) {
            console.error('Microphone access denied:', error);
            this.elements.recordingStatusText.textContent = 'マイクへのアクセスが拒否されました';
        }
    }
    
    loadAudioFile(event) {
        const file = event.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            this.audioPlayer.src = url;
            this.elements.songTitle.textContent = file.name;
            this.elements.playBtn.disabled = false;
            this.elements.pauseBtn.disabled = false;
            this.elements.stopBtn.disabled = false;
            this.updatePracticeAvailability();
        }
    }
    
    playAudio() {
        if (!this.isPracticeMode) {
            this.audioPlayer.play();
            this.isPlaying = true;
        }
    }
    
    pauseAudio() {
        if (!this.isPracticeMode) {
            this.audioPlayer.pause();
            this.isPlaying = false;
        }
    }
    
    stopAudio() {
        if (!this.isPracticeMode) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
            this.isPlaying = false;
        }
    }
    
    updateTimeDisplay() {
        if (this.audioPlayer.duration) {
            this.elements.totalTime.textContent = this.formatTime(this.audioPlayer.duration);
        }
    }
    
    updateProgress() {
        if (this.audioPlayer.duration) {
            const progress = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
            this.elements.progress.style.width = progress + '%';
            this.elements.currentTime.textContent = this.formatTime(this.audioPlayer.currentTime);
        }
    }
    
    handleAudioEnded() {
        this.isPlaying = false;
        if (this.isPracticeMode && this.currentPracticeStep === 'playing') {
            this.handlePracticeLineComplete();
        }
    }
    
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    setLyrics() {
        const lyricsText = this.elements.lyricsInput.value.trim();
        if (lyricsText) {
            this.lyrics = lyricsText.split('\n').filter(line => line.trim() !== '');
            this.displayLyrics();
            this.updatePracticeAvailability();
        }
    }
    
    displayLyrics() {
        this.elements.lyricsDisplay.innerHTML = '';
        this.lyrics.forEach((line, index) => {
            const lineElement = document.createElement('div');
            lineElement.className = 'lyrics-line';
            lineElement.textContent = line;
            lineElement.setAttribute('data-index', index);
            this.elements.lyricsDisplay.appendChild(lineElement);
        });
    }
    
    updatePracticeAvailability() {
        const hasAudio = this.audioPlayer.src !== '';
        const hasLyrics = this.lyrics.length > 0;
        this.elements.startPracticeBtn.disabled = !(hasAudio && hasLyrics);
        
        if (hasAudio && hasLyrics) {
            this.elements.practiceStatusText.textContent = '練習を開始できます';
        } else if (!hasAudio) {
            this.elements.practiceStatusText.textContent = '楽曲を選択してください';
        } else if (!hasLyrics) {
            this.elements.practiceStatusText.textContent = '歌詞を入力してください';
        }
    }
    
    startPractice() {
        this.isPracticeMode = true;
        this.currentLineIndex = 0;
        this.elements.startPracticeBtn.disabled = true;
        this.elements.stopPracticeBtn.disabled = false;
        this.elements.recordBtn.disabled = false;
        this.elements.playBtn.disabled = true;
        this.elements.pauseBtn.disabled = true;
        this.elements.stopBtn.disabled = true;
        
        this.audioPlayer.currentTime = 0;
        this.highlightCurrentLine();
        this.startPracticeLine();
    }
    
    stopPractice() {
        this.isPracticeMode = false;
        this.currentPracticeStep = 'waiting';
        this.elements.startPracticeBtn.disabled = false;
        this.elements.stopPracticeBtn.disabled = true;
        this.elements.recordBtn.disabled = true;
        this.elements.stopRecordBtn.disabled = true;
        this.elements.playBtn.disabled = false;
        this.elements.pauseBtn.disabled = false;
        this.elements.stopBtn.disabled = false;
        
        this.audioPlayer.pause();
        this.clearLyricsHighlight();
        this.elements.practiceStatusText.textContent = '練習を停止しました';
        
        if (this.practiceTimer) {
            clearTimeout(this.practiceTimer);
            this.practiceTimer = null;
        }
    }
    
    startPracticeLine() {
        if (this.currentLineIndex >= this.lyrics.length) {
            this.completePractice();
            return;
        }
        
        this.currentPracticeStep = 'playing';
        this.elements.practiceStatusText.textContent = `${this.currentLineIndex + 1}行目を再生中...`;
        
        // Play the current line for approximately 5 seconds
        this.audioPlayer.play();
        this.practiceTimer = setTimeout(() => {
            this.handlePracticeLineComplete();
        }, 5000);
    }
    
    handlePracticeLineComplete() {
        if (this.practiceTimer) {
            clearTimeout(this.practiceTimer);
            this.practiceTimer = null;
        }
        
        this.audioPlayer.pause();
        this.currentPracticeStep = 'recording';
        this.elements.practiceStatusText.textContent = '録音ボタンを押して歌ってください';
        this.elements.recordBtn.disabled = false;
    }
    
    completePractice() {
        this.elements.practiceStatusText.textContent = '練習完了！お疲れ様でした。';
        this.stopPractice();
    }
    
    highlightCurrentLine() {
        this.clearLyricsHighlight();
        const lineElements = this.elements.lyricsDisplay.querySelectorAll('.lyrics-line');
        
        lineElements.forEach((element, index) => {
            if (index < this.currentLineIndex) {
                element.classList.add('completed');
            } else if (index === this.currentLineIndex) {
                element.classList.add('current');
            }
        });
    }
    
    clearLyricsHighlight() {
        const lineElements = this.elements.lyricsDisplay.querySelectorAll('.lyrics-line');
        lineElements.forEach(element => {
            element.classList.remove('current', 'completed');
        });
    }
    
    async startRecording() {
        if (!this.isPracticeMode) return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.recordedChunks = [];
            
            this.mediaRecorder.addEventListener('dataavailable', (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            });
            
            this.mediaRecorder.addEventListener('stop', () => {
                this.recordedBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                this.elements.playRecordBtn.disabled = false;
                this.elements.recordingStatusText.textContent = '録音完了 - 再生ボタンで確認できます';
                this.currentPracticeStep = 'playback';
                this.elements.practiceStatusText.textContent = '録音を再生して確認してください';
            });
            
            this.mediaRecorder.start();
            this.isRecording = true;
            this.elements.recordBtn.disabled = true;
            this.elements.stopRecordBtn.disabled = false;
            this.elements.recordingStatusText.textContent = '録音中...';
            this.elements.recordingStatusText.classList.add('recording');
            
        } catch (error) {
            console.error('Recording failed:', error);
            this.elements.recordingStatusText.textContent = '録音に失敗しました';
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
            this.elements.recordBtn.disabled = false;
            this.elements.stopRecordBtn.disabled = true;
            this.elements.recordingStatusText.classList.remove('recording');
        }
    }
    
    playRecording() {
        if (this.recordedBlob) {
            const audioUrl = URL.createObjectURL(this.recordedBlob);
            const recordedAudio = new Audio(audioUrl);
            
            recordedAudio.addEventListener('ended', () => {
                if (this.isPracticeMode) {
                    this.moveToNextLine();
                }
            });
            
            recordedAudio.play();
            this.elements.recordingStatusText.textContent = '録音再生中...';
        }
    }
    
    moveToNextLine() {
        this.currentLineIndex++;
        this.highlightCurrentLine();
        
        if (this.currentLineIndex >= this.lyrics.length) {
            this.completePractice();
        } else {
            this.elements.recordBtn.disabled = true;
            this.elements.playRecordBtn.disabled = true;
            this.elements.recordingStatusText.textContent = '録音準備完了';
            
            // Wait 2 seconds before starting next line
            setTimeout(() => {
                this.startPracticeLine();
            }, 2000);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new KaraokeApp();
});