// API設定ファイル
// 注意: 実際のプロダクションでは、APIキーを環境変数で管理してください

const CONFIG = {
    // YouTube Data API v3
    // https://console.developers.google.com でAPIキーを取得
    YOUTUBE_API_KEY: 'YOUR_YOUTUBE_API_KEY_HERE',
    
    // Musixmatch API
    // https://developer.musixmatch.com でAPIキーを取得
    MUSIXMATCH_API_KEY: 'YOUR_MUSIXMATCH_API_KEY_HERE',
    
    // API URLs
    YOUTUBE_SEARCH_URL: 'https://www.googleapis.com/youtube/v3/search',
    MUSIXMATCH_SEARCH_URL: 'https://api.musixmatch.com/ws/1.1/track.search',
    MUSIXMATCH_LYRICS_URL: 'https://api.musixmatch.com/ws/1.1/track.lyrics.get',
    ITUNES_SEARCH_URL: 'https://itunes.apple.com/search',
    
    // 設定
    YOUTUBE_SEARCH_RESULTS: 5,
    MUSIXMATCH_SEARCH_RESULTS: 5,
    ITUNES_SEARCH_RESULTS: 5,
    
    // デモ用サンプルデータ
    DEMO_SONGS: [
        {
            title: '津軽海峡冬景色',
            artist: '石川さゆり',
            duration: '4:23',
            source: 'Sample',
            lyrics: [
                '上野発の夜行列車降りた時から',
                '青森駅は雪の中',
                '北へ帰る人の群れは誰も無口で',
                '海鳴りだけを聞いている',
                '私もひとり連絡船に乗り',
                '故郷を離れる時が来た',
                '青森駅は雪の中',
                '青森駅は雪の中'
            ]
        },
        {
            title: '贈る言葉',
            artist: '海援隊',
            duration: '3:45',
            source: 'Sample',
            lyrics: [
                '暮れない空に焦がれて',
                '空に歌えば',
                '懐かしい人の声がする',
                '振り返れば いつも',
                '君がいて',
                '励ましてくれた',
                'あの時代を',
                '忘れはしない'
            ]
        },
        {
            title: 'First Love',
            artist: '宇多田ヒカル',
            duration: '4:18',
            source: 'Sample',
            lyrics: [
                '最後のキスは',
                'タバコの flavor がした',
                'ニガくて sour な香り',
                'あれから僕は',
                'you've always been in my heart',
                'そして今でも',
                'you're the only one',
                'いつかは終わりが来る'
            ]
        },
        {
            title: '乾杯',
            artist: '恵比寿マスカッツ',
            duration: '3:21',
            source: 'Sample',
            lyrics: [
                '君に乾杯',
                'ありがとう',
                'もう一度',
                '君に乾杯',
                'さようなら',
                'また会える日まで',
                'ここで乾杯',
                'みんなで乾杯'
            ]
        }
    ]
};

// APIキーが設定されているかチェック
function checkAPIKeys() {
    const warnings = [];
    
    if (CONFIG.YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
        warnings.push('YouTube API キーが設定されていません');
    }
    
    if (CONFIG.MUSIXMATCH_API_KEY === 'YOUR_MUSIXMATCH_API_KEY_HERE') {
        warnings.push('Musixmatch API キーが設定されていません');
    }
    
    if (warnings.length > 0) {
        console.warn('API設定の警告:', warnings.join(', '));
        return false;
    }
    
    return true;
}