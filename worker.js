onmessage = async function(e) {
    const { teamData, playerMap, divisions, afcTeams, nfcTeams, numSimulations, calculatePercentiles } = e.data;

    // Initialize win probabilities for all players
    for (const playerData of playerMap.values()) {
        playerData.simulatedWins = 0;
    }

    // Initialize a Map to store points for each player in each simulation
    const playerPointsHistory = new Map();
    for (const player of playerMap.keys()) {
        playerPointsHistory.set(player, []);
    }

    // If calculatePercentiles is true, override numSimulations to 1,000,000
    let localNumSimulations = numSimulations;
    if (calculatePercentiles) {
        localNumSimulations = 1000000;
    }

    // Run numSimulations simulations
    for (let sim = 0; sim < localNumSimulations; sim++) {
         
        // Track which teams make playoffs in this simulation
        const playoffTeams = new Set();
        
        // 1a) For each division, randomly sample 1 team weighted by division win probability
        for (const division in divisions) {
            const divisionTeams = divisions[division];
            const weights = divisionTeams.map(team => team.probability_division_win);
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            let random = Math.random() * totalWeight;
            
            for (let i = 0; i < divisionTeams.length; i++) {
                random -= weights[i];
                if (random <= 0) {
                    playoffTeams.add(divisionTeams[i]);
                    break;
                }
            }
        }

        // 1b & 1c) For each conference, sample 3 wildcard teams
        ['AFC', 'NFC'].forEach(conference => {
            const conferenceTeams = conference === 'AFC' ? afcTeams : nfcTeams;
            const remainingTeams = conferenceTeams.filter(team => !playoffTeams.has(team));
            const weights = remainingTeams.map(team => 
                Math.max(0, team.probability_playoffs - team.probability_division_win)
            );

            for (let i = 0; i < 3; i++) {
                const totalWeight = weights.reduce((a, b) => a + b, 0);
                if (totalWeight <= 0) break;
                
                let random = Math.random() * totalWeight;
                for (let j = 0; j < remainingTeams.length; j++) {
                    random -= weights[j];
                    if (random <= 0) {
                        playoffTeams.add(remainingTeams[j]);
                        weights[j] = 0; // Can't pick the same team twice
                        break;
                    }
                }
            }
        });

        // Calculate points for each player in this simulation
        const playerPoints = new Map();
        let maxPoints = -1;

        for (const [player, data] of playerMap) {
            let points = 0;
            
            // Check teams player picked to make playoffs
            teamData.forEach(team => {
                if (team.players_list_make_playoffs?.includes(player)) {
                    points += playoffTeams.has(team) ? team.points_playoffs : 0;
                }
                if (team.players_list_miss_playoffs?.includes(player)) {
                    points += !playoffTeams.has(team) ? team.points_no_playoffs : 0;
                }
            });

            playerPoints.set(player, points);
            maxPoints = Math.max(maxPoints, points);
        }

        // Find winners (could be multiple if tied)
        const winners = Array.from(playerPoints.entries())
            .filter(([_, points]) => points === maxPoints)
            .map(([player, _]) => player);

        // Distribute 1 win among winners
        const simulatedWinsPerPlayer = 1 / winners.length;
        winners.forEach(winner => {
            playerMap.get(winner).simulatedWins += simulatedWinsPerPlayer;
        });

        // Store points for this simulation if CalculatePercentiles is true
        if (calculatePercentiles) {
        
            for (const [player, points] of playerPoints) {
                playerPointsHistory.get(player).push(points);
            }
        }
    }

    // Calculate percentiles if required
    if (calculatePercentiles) {
        for (const [player, pointsList] of playerPointsHistory) {
            pointsList.sort((a, b) => a - b); // Sort points

            // Calculate 10th, 50th (median), and 90th percentiles
            const percentiles = [0.05, 0.25, 0.5, 0.75, 0.95, 0, 0.9999999].map(p => {
                const index = Math.floor(p * pointsList.length);
                return pointsList[index];
            });

            // Store percentiles in playerMap
            const playerData = playerMap.get(player);
            playerData.percentile_05 = percentiles[0];
            playerData.percentile_25 = percentiles[1];
            playerData.percentile_50 = percentiles[2];
            playerData.percentile_75 = percentiles[3];
            playerData.percentile_95 = percentiles[4];
            playerData.simulatedMin = percentiles[5];
            playerData.simulatedMax = percentiles[6];
            
            // Calculate the mode
            const frequencyMap = new Map();
            let maxCount = 0;
            let mode = [];

            for (const points of pointsList) {
                const count = (frequencyMap.get(points) || 0) + 1;
                frequencyMap.set(points, count);

                if (count > maxCount) {
                    maxCount = count;
                    mode = [points];
                } else if (count === maxCount) {
                    mode.push(points);
                }
            }
            playerData.mode = mode;
        }
    }

    postMessage({ playerMap, completedSimulations: localNumSimulations, percentilesCalculated: calculatePercentiles });
};