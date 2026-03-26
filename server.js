const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Your credentials - REPLACE THESE WITH YOUR ACTUAL VALUES
const CLIENT_ID = 'partners-6a33fc8750f50d0d7f76a6cda17e8191';  // ← GET THIS FROM YOUR MANAGER
const CLIENT_SECRET = 'kNs4sIXKO!MZN1hmvrA4ctDBJSIHwAjSGPhHe%LT%fwuIeIY#7nG06#@#jQ9@x02';  // ← YOUR ACTUAL SECRET
const REF = 1;  // Your partner ID

// Store token
let accessToken = null;
let tokenExpiryTime = null;

// Function to get access token
async function getAccessToken() {
    console.log('🔄 Getting access token...');
    
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
        console.log('⏰ Token expires in', response.data.expires_in, 'seconds');
        
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
                    lng: 'en',
                    schemeOfGettingOddsOperations: 'GetAllOdds',
                    count: 5  // Get only 5 events for testing
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
                    sportIds: 1,  // Football only
                    count: 50  // Get more events to see grouping
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
                oddsLocalization: event.oddsLocalization,
                statGameId: event.statGameId,
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

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📋 Test auth at: http://localhost:${PORT}/test-auth`);
    console.log(`⚽ Get events at: http://localhost:${PORT}/events`);
    console.log(`🏆 Get events by match at: http://localhost:${PORT}/events-by-match`);
});