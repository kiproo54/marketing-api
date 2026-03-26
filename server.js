const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CORS - Allow all origins (Fixes admin panel)
// ============================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Get credentials from environment variables (Vercel will inject these)
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REF = parseInt(process.env.REF) || 1;

// Store token in memory
let accessToken = null;
let tokenExpiryTime = null;

// Function to get access token
async function getAccessToken() {
    console.log('🔄 Getting access token...');
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('CLIENT_ID and CLIENT_SECRET must be set in environment variables');
    }
    
    try {
        const response = await axios.post(
            'https://cpservm.com/gateway/token',
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        accessToken = response.data.access_token;
        tokenExpiryTime = Date.now() + (response.data.expires_in * 1000);
        
        console.log('✅ Token obtained!');
        
        return accessToken;
    } catch (error) {
        console.error('❌ Error getting token:', error.response?.data || error.message);
        throw error;
    }
}

// Test endpoint
app.get('/test-auth', async (req, res) => {
    console.log('📞 Testing authentication...');
    
    try {
        const token = await getAccessToken();
        res.json({
            success: true,
            message: 'Authentication successful!',
            tokenReceived: token ? 'Yes' : 'No'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get sports events
app.get('/events', async (req, res) => {
    console.log('📋 Fetching sports events...');
    
    try {
        if (!accessToken || Date.now() >= tokenExpiryTime) {
            await getAccessToken();
        }
        
        const response = await axios.get(
            'https://cpservm.com/gateway/marketing/datafeed/prematch/api/v2/sportevents',
            {
                params: {
                    ref: REF,
                    lng: req.query.lng || 'en',
                    schemeOfGettingOddsOperations: req.query.scheme || 'GetAllOdds',
                    sportIds: req.query.sportIds || 1,
                    count: parseInt(req.query.count) || 10
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        res.json({
            success: true,
            count: response.data?.count,
            events: response.data?.items
        });
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// Get games for today and tomorrow - FOOTBALL ONLY
app.get('/games-today-tomorrow', async (req, res) => {
    console.log('📅 Fetching FOOTBALL games for today and tomorrow...');
    
    try {
        // Make sure we have a valid token
        if (!accessToken || Date.now() >= tokenExpiryTime) {
            await getAccessToken();
        }
        
        // Get current time and tomorrow's time
        const now = Math.floor(Date.now() / 1000);
        const tomorrow = now + (24 * 60 * 60);
        
        console.log(`📅 Today timestamp: ${now}`);
        console.log(`📅 Tomorrow timestamp: ${tomorrow}`);
        
        // Call the API with date filters - FOOTBALL ONLY (sportId=1)
        const response = await axios.get(
            'https://cpservm.com/gateway/marketing/datafeed/prematch/api/v2/sportevents',
            {
                params: {
                    ref: REF,
                    lng: req.query.lng || 'en',
                    schemeOfGettingOddsOperations: 'GetAllOdds',
                    sportIds: 1,  // FOOTBALL ONLY
                    gtStart: now,
                    ltStart: tomorrow,
                    count: parseInt(req.query.count) || 500
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        const events = response.data?.items || [];
        
        // Format dates for display
        const formatDate = (timestamp) => {
            const date = new Date(timestamp * 1000);
            return date.toLocaleString('en-US', {
                dateStyle: 'full',
                timeStyle: 'short'
            });
        };
        
        // Group by date (today vs tomorrow) AND by league
        const todayGames = [];
        const tomorrowGames = [];
        const todayTimestamp = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
        const tomorrowTimestamp = todayTimestamp + (24 * 60 * 60);
        
        // Also group by league for better organization
        const todayLeagues = new Map();
        const tomorrowLeagues = new Map();
        
        events.forEach(event => {
            // Only include main events (period=0, type=1) to avoid duplicates
            if (event.period !== 0 || event.type !== 1) return;
            
            const gameDate = new Date(event.startDate * 1000);
            const gameDateStart = Math.floor(new Date(gameDate.setHours(0, 0, 0, 0)) / 1000);
            
            // Get main odds (W1, X, W2)
            const mainOdds = {
                w1: null,
                draw: null,
                w2: null
            };
            
            if (event.oddsLocalization) {
                event.oddsLocalization.forEach(odd => {
                    if (odd.type === 1) mainOdds.w1 = odd.oddsMarket;
                    if (odd.type === 2) mainOdds.draw = odd.oddsMarket;
                    if (odd.type === 3) mainOdds.w2 = odd.oddsMarket;
                });
            }
            
            const gameInfo = {
                sportEventId: event.sportEventId,
                constSportEventId: event.constSportEventId,
                mainConstSportEventId: event.mainConstSportEventId,
                tournamentId: event.tournamentId,
                tournamentName: event.tournamentNameLocalization,
                team1: event.opponent1NameLocalization,
                team2: event.opponent2NameLocalization,
                team1Image: event.imageOpponent1,
                team2Image: event.imageOpponent2,
                startDate: event.startDate,
                startDateFormatted: formatDate(event.startDate),
                link: event.link,
                hasVideo: event.hasVideo,
                hasInsights: event.hasInsights,
                odds: mainOdds
            };
            
            if (gameDateStart === todayTimestamp) {
                todayGames.push(gameInfo);
                // Group by league for today
                if (!todayLeagues.has(event.tournamentNameLocalization)) {
                    todayLeagues.set(event.tournamentNameLocalization, {
                        tournamentId: event.tournamentId,
                        tournamentName: event.tournamentNameLocalization,
                        games: []
                    });
                }
                todayLeagues.get(event.tournamentNameLocalization).games.push(gameInfo);
            } else if (gameDateStart === tomorrowTimestamp) {
                tomorrowGames.push(gameInfo);
                // Group by league for tomorrow
                if (!tomorrowLeagues.has(event.tournamentNameLocalization)) {
                    tomorrowLeagues.set(event.tournamentNameLocalization, {
                        tournamentId: event.tournamentId,
                        tournamentName: event.tournamentNameLocalization,
                        games: []
                    });
                }
                tomorrowLeagues.get(event.tournamentNameLocalization).games.push(gameInfo);
            }
        });
        
        // Convert leagues maps to sorted arrays
        const todayLeaguesList = Array.from(todayLeagues.values()).sort((a, b) => 
            a.tournamentName.localeCompare(b.tournamentName)
        );
        const tomorrowLeaguesList = Array.from(tomorrowLeagues.values()).sort((a, b) => 
            a.tournamentName.localeCompare(b.tournamentName)
        );
        
        console.log(`✅ Today: ${todayGames.length} games in ${todayLeaguesList.length} leagues`);
        console.log(`✅ Tomorrow: ${tomorrowGames.length} games in ${tomorrowLeaguesList.length} leagues`);
        
        res.json({
            success: true,
            sport: "Football (Soccer)",
            today: {
                count: todayGames.length,
                leagueCount: todayLeaguesList.length,
                leagues: todayLeaguesList
            },
            tomorrow: {
                count: tomorrowGames.length,
                leagueCount: tomorrowLeaguesList.length,
                leagues: tomorrowLeaguesList
            },
            totalGames: todayGames.length + tomorrowGames.length,
            filters: {
                sportId: 1,
                dateRange: {
                    from: new Date(now * 1000).toISOString().split('T')[0],
                    to: new Date(tomorrow * 1000).toISOString().split('T')[0]
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching games:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// Get odds for a specific sportEventId
app.get('/event-odds/:sportEventId', async (req, res) => {
    const sportEventId = req.params.sportEventId;
    console.log(`📊 Getting odds for sportEventId: ${sportEventId}`);
    
    try {
        if (!accessToken || Date.now() >= tokenExpiryTime) {
            await getAccessToken();
        }
        
        const response = await axios.get(
            'https://cpservm.com/gateway/marketing/datafeed/prematch/api/v2/sportevents',
            {
                params: {
                    ref: REF,
                    lng: req.query.lng || 'en',
                    schemeOfGettingOddsOperations: 'GetAllOdds',
                    sporteventids: sportEventId
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        const event = response.data?.items?.[0];
        
        if (!event) {
            return res.json({
                success: false,
                message: `No event found for ID: ${sportEventId}`
            });
        }
        
        console.log(`✅ Retrieved odds for event ${sportEventId} - ${event.oddsLocalization?.length || 0} markets found`);
        
        // Format odds for response
        const formattedOdds = [];
        if (event.oddsLocalization) {
            event.oddsLocalization.forEach(odd => {
                formattedOdds.push({
                    type: odd.type,
                    display: odd.display,
                    oddsMarket: odd.oddsMarket,
                    parameter: odd.parameter,
                    isCenter: odd.isCenter,
                    isBlocked: odd.isBlocked
                });
            });
        }
        
        res.json({
            success: true,
            sportEventId: event.sportEventId,
            constSportEventId: event.constSportEventId,
            mainConstSportEventId: event.mainConstSportEventId,
            tournamentName: event.tournamentNameLocalization,
            team1: event.opponent1NameLocalization,
            team2: event.opponent2NameLocalization,
            period: event.period,
            periodName: event.periodName,
            type: event.type,
            vid: event.vid,
            startDate: event.startDate,
            link: event.link,
            hasVideo: event.hasVideo,
            waitingLive: event.waitingLive,
            odds: formattedOdds,
            oddsCount: formattedOdds.length
        });
        
    } catch (error) {
        console.error('❌ Error getting event odds:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// Get all football games - ALL LEAGUES, ALL DATES
app.get('/all-games', async (req, res) => {
    console.log('⚽ Fetching ALL FOOTBALL games from all leagues...');
    
    try {
        if (!accessToken || Date.now() >= tokenExpiryTime) {
            await getAccessToken();
        }
        
        const response = await axios.get(
            'https://cpservm.com/gateway/marketing/datafeed/prematch/api/v2/sportevents',
            {
                params: {
                    ref: REF,
                    lng: req.query.lng || 'en',
                    schemeOfGettingOddsOperations: req.query.scheme || 'GetAllOdds',
                    sportIds: 1,
                    count: parseInt(req.query.count) || 500
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        const events = response.data?.items || [];
        const mainEvents = events.filter(event => event.period === 0 && event.type === 1);
        
        const formatDate = (timestamp) => {
            const date = new Date(timestamp * 1000);
            return date.toLocaleString('en-US', {
                dateStyle: 'full',
                timeStyle: 'short'
            });
        };
        
        const leaguesMap = new Map();
        
        mainEvents.forEach(event => {
            const tournamentId = event.tournamentId;
            const tournamentName = event.tournamentNameLocalization;
            
            if (!leaguesMap.has(tournamentId)) {
                leaguesMap.set(tournamentId, {
                    tournamentId: tournamentId,
                    tournamentName: tournamentName,
                    tournamentImage: event.tournamentImage,
                    games: []
                });
            }
            
            const mainOdds = {
                w1: null,
                draw: null,
                w2: null
            };
            
            if (event.oddsLocalization) {
                event.oddsLocalization.forEach(odd => {
                    if (odd.type === 1) mainOdds.w1 = odd.oddsMarket;
                    if (odd.type === 2) mainOdds.draw = odd.oddsMarket;
                    if (odd.type === 3) mainOdds.w2 = odd.oddsMarket;
                });
            }
            
            leaguesMap.get(tournamentId).games.push({
                sportEventId: event.sportEventId,
                constSportEventId: event.constSportEventId,
                mainConstSportEventId: event.mainConstSportEventId,
                team1: event.opponent1NameLocalization,
                team2: event.opponent2NameLocalization,
                team1Image: event.imageOpponent1,
                team2Image: event.imageOpponent2,
                startDate: event.startDate,
                startDateFormatted: formatDate(event.startDate),
                link: event.link,
                hasVideo: event.hasVideo,
                hasInsights: event.hasInsights,
                odds: mainOdds,
                totalMarkets: event.oddsLocalization?.length || 0
            });
        });
        
        const leagues = Array.from(leaguesMap.values()).sort((a, b) => {
            return (a.tournamentName || '').localeCompare(b.tournamentName || '');
        });
        
        const totalGames = leagues.reduce((sum, league) => sum + league.games.length, 0);
        
        console.log(`✅ Found ${totalGames} football games across ${leagues.length} leagues`);
        
        res.json({
            success: true,
            sport: "Football (Soccer)",
            sportId: 1,
            summary: {
                totalGames: totalGames,
                totalLeagues: leagues.length
            },
            leagues: leagues
        });
        
    } catch (error) {
        console.error('❌ Error fetching all games:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Football Marketing API Integration',
        version: '1.0.0',
        sport: 'Football Only (sportId=1)',
        endpoints: [
            { path: '/test-auth', method: 'GET', description: 'Test authentication' },
            { path: '/events', method: 'GET', description: 'Get football events with odds', params: '?lng=en&count=10' },
            { path: '/events-by-match', method: 'GET', description: 'Get events grouped by match', params: '?count=50' },
            { path: '/games-today-tomorrow', method: 'GET', description: 'Get FOOTBALL games for today and tomorrow', params: '?lng=en&count=500' },
            { path: '/all-games', method: 'GET', description: 'Get ALL FOOTBALL games from ALL LEAGUES', params: '?count=500&lng=en' },
            { path: '/event-odds/:sportEventId', method: 'GET', description: 'Get odds for specific football event', example: '/event-odds/704114254' }
        ]
    });
});

// Export for Vercel serverless function
if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(PORT, () => {
        console.log(`🚀 Football API running at http://localhost:${PORT}`);
        console.log(`⚽ Football only - sportId=1`);
        console.log(`📅 Today/Tomorrow games: http://localhost:${PORT}/games-today-tomorrow`);
        console.log(`🌍 All games: http://localhost:${PORT}/all-games`);
    });
}