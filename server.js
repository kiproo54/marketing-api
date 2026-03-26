const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Get credentials from environment variables (Vercel will inject these)
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REF = parseInt(process.env.REF) || 1;

// Store token in memory (will reset on each serverless function call)
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

// Test endpoint - Step 1: Test authentication
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

// Get sports events - Step 2: Fetch actual events
app.get('/events', async (req, res) => {
    console.log('📋 Fetching sports events...');
    
    try {
        // Make sure we have a valid token
        if (!accessToken || Date.now() >= tokenExpiryTime) {
            await getAccessToken();
        }
        
        // Call the actual API to get sports events
        const response = await axios.get(
            'https://cpservm.com/gateway/marketing/datafeed/prematch/api/v2/sportevents',
            {
                params: {
                    ref: REF,
                    lng: req.query.lng || 'en',
                    schemeOfGettingOddsOperations: req.query.scheme || 'GetAllOdds',
                    sportIds: req.query.sportIds,
                    count: parseInt(req.query.count) || 10
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        console.log('✅ Events fetched! Count:', response.data?.count || 0);
        res.json({
            success: true,
            count: response.data?.count,
            events: response.data?.items
        });
    } catch (error) {
        console.error('❌ Error fetching events:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// Get events grouped by match - Step 3: Group by mainConstSportEventId
app.get('/events-by-match', async (req, res) => {
    console.log('📋 Fetching and grouping events by match...');
    
    try {
        // Make sure we have a valid token
        if (!accessToken || Date.now() >= tokenExpiryTime) {
            await getAccessToken();
        }
        
        // Call the actual API to get sports events
        const response = await axios.get(
            'https://cpservm.com/gateway/marketing/datafeed/prematch/api/v2/sportevents',
            {
                params: {
                    ref: REF,
                    lng: 'en',
                    schemeOfGettingOddsOperations: 'GetAllOdds',
                    sportIds: req.query.sportIds || 1,
                    count: parseInt(req.query.count) || 50
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        const events = response.data?.items || [];
        
        // Group events by mainConstSportEventId
        const matchesMap = new Map();
        
        events.forEach(event => {
            const matchId = event.mainConstSportEventId;
            
            if (!matchesMap.has(matchId)) {
                matchesMap.set(matchId, {
                    mainConstSportEventId: matchId,
                    tournamentName: event.tournamentNameLocalization,
                    sportId: event.sportId,
                    startDate: event.startDate,
                    opponents: {
                        team1: event.opponent1NameLocalization,
                        team2: event.opponent2NameLocalization,
                        team1Image: event.imageOpponent1,
                        team2Image: event.imageOpponent2,
                        team1Ids: event.opponent1Ids,
                        team2Ids: event.opponent2Ids
                    },
                    events: []
                });
            }
            
            // Add this sport event to the match
            matchesMap.get(matchId).events.push({
                sportEventId: event.sportEventId,
                constSportEventId: event.constSportEventId,
                type: event.type,
                vid: event.vid,
                period: event.period,
                periodName: event.periodName,
                link: event.link,
                hasVideo: event.hasVideo,
                waitingLive: event.waitingLive,
                hasInsights: event.hasInsights
            });
        });
        
        // Convert map to array and sort by start date
        const matches = Array.from(matchesMap.values()).sort((a, b) => a.startDate - b.startDate);
        
        console.log('✅ Grouped events! Matches:', matches.length, 'Total events:', events.length);
        
        res.json({
            success: true,
            totalMatches: matches.length,
            totalEvents: events.length,
            matches: matches
        });
        
    } catch (error) {
        console.error('❌ Error fetching events:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// Get games for today and tomorrow - Step 5: Filter by date
app.get('/games-today-tomorrow', async (req, res) => {
    console.log('📅 Fetching games for today and tomorrow...');
    
    try {
        // Make sure we have a valid token
        if (!accessToken || Date.now() >= tokenExpiryTime) {
            await getAccessToken();
        }
        
        // Get current time and tomorrow's time
        const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
        const tomorrow = now + (24 * 60 * 60); // Add 24 hours
        
        console.log(`📅 Today timestamp: ${now}`);
        console.log(`📅 Tomorrow timestamp: ${tomorrow}`);
        
        // Call the API with date filters
        const response = await axios.get(
            'https://cpservm.com/gateway/marketing/datafeed/prematch/api/v2/sportevents',
            {
                params: {
                    ref: REF,
                    lng: req.query.lng || 'en',
                    schemeOfGettingOddsOperations: 'GetAllOdds',
                    sportIds: req.query.sportIds || 1,  // Default to football
                    gtStart: now,    // Greater than current time
                    ltStart: tomorrow, // Less than tomorrow
                    count: parseInt(req.query.count) || 100
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
        
        // Group by date (today vs tomorrow)
        const todayGames = [];
        const tomorrowGames = [];
        const todayTimestamp = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
        const tomorrowTimestamp = todayTimestamp + (24 * 60 * 60);
        
        events.forEach(event => {
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
                tournamentName: event.tournamentNameLocalization,
                team1: event.opponent1NameLocalization,
                team2: event.opponent2NameLocalization,
                team1Image: event.imageOpponent1,
                team2Image: event.imageOpponent2,
                startDate: event.startDate,
                startDateFormatted: formatDate(event.startDate),
                period: event.period,
                periodName: event.periodName,
                type: event.type,
                vid: event.vid,
                link: event.link,
                hasVideo: event.hasVideo,
                hasInsights: event.hasInsights,
                odds: mainOdds,
                totalMarkets: event.oddsLocalization?.length || 0
            };
            
            if (gameDateStart === todayTimestamp) {
                todayGames.push(gameInfo);
            } else if (gameDateStart === tomorrowTimestamp) {
                tomorrowGames.push(gameInfo);
            }
        });
        
        console.log(`✅ Found ${todayGames.length} games today, ${tomorrowGames.length} games tomorrow`);
        
        res.json({
            success: true,
            today: {
                count: todayGames.length,
                games: todayGames
            },
            tomorrow: {
                count: tomorrowGames.length,
                games: tomorrowGames
            },
            totalGames: todayGames.length + tomorrowGames.length,
            filters: {
                sportIds: req.query.sportIds || 1,
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

// Get odds for a specific sportEventId - Step 4: Direct odds lookup
app.get('/event-odds/:sportEventId', async (req, res) => {
    const sportEventId = req.params.sportEventId;
    console.log(`📊 Getting odds for sportEventId: ${sportEventId}`);
    
    try {
        // Make sure we have a valid token
        if (!accessToken || Date.now() >= tokenExpiryTime) {
            await getAccessToken();
        }
        
        // Get odds for this specific sportEventId
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
            odds: event.oddsLocalization || [],
            oddsCount: event.oddsLocalization?.length || 0
        });
        
    } catch (error) {
        console.error('❌ Error getting event odds:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// Get odds for all events in a specific match
app.get('/match-odds/:matchId', async (req, res) => {
    const matchId = req.params.matchId;
    console.log(`📊 Getting odds for match ID: ${matchId}`);
    
    try {
        // Make sure we have a valid token
        if (!accessToken || Date.now() >= tokenExpiryTime) {
            await getAccessToken();
        }
        
        // First, get all events for this match
        const eventsResponse = await axios.get(
            'https://cpservm.com/gateway/marketing/datafeed/prematch/api/v2/sportevents',
            {
                params: {
                    ref: REF,
                    lng: 'en',
                    schemeOfGettingOddsOperations: 'GetAllOdds',
                    sporteventids: matchId
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        const events = eventsResponse.data?.items || [];
        
        if (events.length === 0) {
            return res.json({
                success: false,
                message: `No events found for match ID: ${matchId}`
            });
        }
        
        // Get the main match info from first event
        const matchInfo = {
            mainConstSportEventId: events[0].mainConstSportEventId,
            tournamentName: events[0].tournamentNameLocalization,
            team1: events[0].opponent1NameLocalization,
            team2: events[0].opponent2NameLocalization,
            startDate: events[0].startDate,
            sportId: events[0].sportId
        };
        
        // Now get odds for each unique sportEventId
        const oddsResults = [];
        
        for (const event of events) {
            console.log(`  📍 Getting odds for sportEventId: ${event.sportEventId} (Period: ${event.periodName || 'Main'}, Type: ${event.type})`);
            
            const oddsResponse = await axios.get(
                'https://cpservm.com/gateway/marketing/datafeed/prematch/api/v2/sportevents',
                {
                    params: {
                        ref: REF,
                        lng: 'en',
                        schemeOfGettingOddsOperations: 'GetAllOdds',
                        sporteventids: event.sportEventId
                    },
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );
            
            const oddsData = oddsResponse.data?.items?.[0] || {};
            
            oddsResults.push({
                sportEventId: event.sportEventId,
                constSportEventId: event.constSportEventId,
                type: event.type,
                vid: event.vid,
                period: event.period,
                periodName: event.periodName,
                link: event.link,
                odds: oddsData.oddsLocalization || [],
                oddsCount: oddsData.oddsLocalization?.length || 0
            });
        }
        
        console.log(`✅ Retrieved odds for ${oddsResults.length} events`);
        
        res.json({
            success: true,
            match: matchInfo,
            totalEvents: oddsResults.length,
            events: oddsResults
        });
        
    } catch (error) {
        console.error('❌ Error getting match odds:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// Root endpoint - Show available endpoints
app.get('/', (req, res) => {
    res.json({
        name: 'Marketing API Integration',
        version: '1.0.0',
        endpoints: [
            {
                path: '/test-auth',
                method: 'GET',
                description: 'Test authentication'
            },
            {
                path: '/events',
                method: 'GET',
                description: 'Get sports events with odds',
                params: '?lng=en&sportIds=1&count=10'
            },
            {
                path: '/events-by-match',
                method: 'GET',
                description: 'Get events grouped by match',
                params: '?sportIds=1&count=50'
            },
            {
                path: '/games-today-tomorrow',
                method: 'GET',
                description: 'Get games for today and tomorrow only',
                params: '?sportIds=1&lng=en'
            },
            {
                path: '/event-odds/:sportEventId',
                method: 'GET',
                description: 'Get odds for specific event',
                example: '/event-odds/704114254'
            },
            {
                path: '/match-odds/:matchId',
                method: 'GET',
                description: 'Get odds for all events in a match',
                example: '/match-odds/314606070'
            }
        ]
    });
});

// Export for Vercel serverless function
if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
        console.log(`📋 Test auth at: http://localhost:${PORT}/test-auth`);
        console.log(`⚽ Get events at: http://localhost:${PORT}/events`);
        console.log(`🏆 Get events by match at: http://localhost:${PORT}/events-by-match`);
        console.log(`📅 Get today/tomorrow games at: http://localhost:${PORT}/games-today-tomorrow`);
        console.log(`📊 Get event odds at: http://localhost:${PORT}/event-odds/704114254`);
    });
}