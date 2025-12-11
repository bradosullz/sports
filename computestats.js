/**
 * Fetches team data and probability data, merges them, and computes additional statistics.
 * Returns the updated team data with probabilities and playoff likelihoods.
 * 
 * @returns {Promise<Array>} Updated team data with probabilities and playoff likelihoods.
 */

export async function updateTeamData(teamData) {
    let probabilityData = [];
    
    // Fetches team data from the specified URL when the page loads.
    try {
        const response = await fetch('teaminfo.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        teamData = await response.json();
    } catch (error) {
        console.error("Could not fetch team data:", error);
        // Optionally, display an error message to the user on the page
        return; // Stop script execution if data isn't loaded
    }

    // Updates probability data from ESPN from the specified URL the page loads.
    try {
        const response = await fetch('https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?region=us&lang=en');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        probabilityData = await response.json();
    } catch (error) {
        console.error("Could not fetch probability data:", error);
        // Optionally, display an error message to the user on the page
        return; // Stop script execution if data isn't loaded
    }

    // Merge probability data into teamData based on team names
    const probabilityMap = {};
    probabilityData.teams.forEach(teamD => {
        probabilityMap[teamD.team.displayName] = {
            playoffOdds: teamD.categories[1].values[5] / 100, 
            divisionOdds: teamD.categories[1].values[4] / 100 
        };
    });

    teamData.forEach(team => {
        if (probabilityMap.hasOwnProperty(team.Team)) {
            team.probability_playoffs = probabilityMap[team.Team].playoffOdds;
            team.probability_division_win = probabilityMap[team.Team].divisionOdds;
        } else {
            team.probability_playoffs = 0; // Default value if not found
            team.probability_division_win = 0;
        }
    });

    // Add the timestamp to teamData
    teamData.lastUpdated = probabilityData.lastUpdated;

    /**
     * Calculate the 14 teams that make the playoffs in the most likely scenario that is consistent with the NFL playoff format
     * 
     */
    const divisions = {};
    const afcTeams = [];
    const nfcTeams = [];

    // Group teams by division and separate them into AFC and NFC
    teamData.forEach(team => {
    const division = team.division;
    if (!divisions[division]) {
        divisions[division] = [];
    }
    divisions[division].push(team);

    if (division.startsWith('AFC')) {
        afcTeams.push(team);
    } else if (division.startsWith('NFC')) {
        nfcTeams.push(team);
    }
    });
    teamData.divisions = divisions; // Store divisions in teamData for potential future use
    teamData.afcTeams = afcTeams; // Store AFC teams in teamData for potential future use
    teamData.nfcTeams = nfcTeams; // Store NFC teams in teamData for potential future use

    // Set most_likely_playoffs to true for the division winner
    for (const division in divisions) {
    let divisionWinner = null;
    let maxProb = -1;
    divisions[division].forEach(team => {
        if (team.probability_division_win > maxProb) {
        maxProb = team.probability_division_win;
        divisionWinner = team;
        }
    });
    if (divisionWinner) {
        divisionWinner.most_likely_playoffs = true;
        divisionWinner.playoffs_type = "Division Winner";
    }
    }

    // Filter out division winners from the remaining teams
    const remainingAFCTeams = afcTeams.filter(team => !team.most_likely_playoffs);
    const remainingNFCTeams = nfcTeams.filter(team => !team.most_likely_playoffs);

    // Calculate wildcard probability for the remaining teams
    remainingAFCTeams.forEach(team => {
    team.probability_wildcard = team.probability_playoffs - team.probability_division_win;
    });
    remainingNFCTeams.forEach(team => {
    team.probability_wildcard = team.probability_playoffs - team.probability_division_win;
    });

    // Sort the remaining teams by the new metric in descending order
    remainingAFCTeams.sort((a, b) => b.probability_wildcard - a.probability_wildcard);
    remainingNFCTeams.sort((a, b) => b.probability_wildcard - a.probability_wildcard);

    // Set most_likely_playoffs to true for the top 3 wild card teams in each conference
    for (let i = 0; i < 3 && i < remainingAFCTeams.length; i++) {
    remainingAFCTeams[i].most_likely_playoffs = true;
    remainingAFCTeams[i].playoffs_type = "Wildcard";
    }
    for (let i = 0; i < 3 && i < remainingNFCTeams.length; i++) {
    remainingNFCTeams[i].most_likely_playoffs = true;
    remainingNFCTeams[i].playoffs_type = "Wildcard";
    }

    // For all other teams, set most_likely_playoffs to false
    teamData.forEach(team => {
    if (typeof team.most_likely_playoffs === 'undefined') {
        team.most_likely_playoffs = false;
    }
    });

    return teamData;
}

/**
 * Calculates the player data used in standings tables
 */
export function calculatePlayerData(teamData, playerMap) {
    
    // Helper function to initialize a player if they don't exist in the map
    const initializePlayer = (player) => {
    if (!playerMap.has(player)) {
        playerMap.set(player, {
        player: player,
        expectedPoints: 0,
        mostLikelyPoints: 0,
        maxPoints: 0,
        minPoints: 0,
        simulatedWins: 0
        });
    }
    };

    // Iterate over each team to calculate points
    teamData.forEach(team => {
        const {
            probability_playoffs,
            most_likely_playoffs,
            points_playoffs,
            points_no_playoffs,
            players_list_make_playoffs,
            players_list_miss_playoffs
        } = team;

        // Process players who get points if the team makes the playoffs
        if (players_list_make_playoffs) {
            players_list_make_playoffs.forEach(player => {
            initializePlayer(player);
            const playerData = playerMap.get(player);

            // Calculate expectedPoints
            playerData.expectedPoints += points_playoffs * probability_playoffs;

            // Calculate mostLikelyPoints
            if (most_likely_playoffs === true) {
                playerData.mostLikelyPoints += points_playoffs;
            }

            // Calculate maxPoints
            if (probability_playoffs > 0) {
                playerData.maxPoints += points_playoffs;
            }
            // Calculate minPoints
            if (probability_playoffs == 1) {
                playerData.minPoints += points_playoffs;
            }
            });
        }

        // Process players who get points if the team misses the playoffs
        if (players_list_miss_playoffs) {
            players_list_miss_playoffs.forEach(player => {
            initializePlayer(player);
            const playerData = playerMap.get(player);
            const prob_miss_playoffs = 1 - probability_playoffs;

            // Calculate expectedPoints
            playerData.expectedPoints += points_no_playoffs * prob_miss_playoffs;

            // Calculate mostLikelyPoints
            if (most_likely_playoffs === false) {
                playerData.mostLikelyPoints += points_no_playoffs;
            }

            // Calculate maxPoints
            if (probability_playoffs < 1) {
                playerData.maxPoints += points_no_playoffs;
            }

            // Calculate minPoints
            if (probability_playoffs == 0) {
                playerData.minPoints += points_no_playoffs;
            }
            });
        }
    });

    return playerMap;

}

/** Runs simulations for win probabilities and percentiles */
export async function runSimulations(teamData, playerMap, simulationCount, calculatePercentiles) {
    //Use all the threads but leave one free for the UI
    const NUM_WORKERS = navigator.hardwareConcurrency ? navigator.hardwareConcurrency - 1 : 1;
    
    //If teamData.completedSimulations does not exist, set it to 0
    if (!teamData.completedSimulations) {
        teamData.completedSimulations = 0;
    }
    
    // Create a collection of Web Workers
    const workers = [];
    const workerPromises = []; // Array to hold promises for each worker

    for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = new Worker('worker.js');
        workers.push(worker);

        // Create a promise for each worker
        workerPromises.push(new Promise(resolve => {
            worker.onmessage = function(e) {
                const simulationPlayerMap = e.data.playerMap;
                teamData.completedSimulations += e.data.completedSimulations;

                // Update the number of simulated wins and copy other computed properties for each player
                simulationPlayerMap.forEach((data, player) => {
                    if (playerMap.has(player)) {
                        const playerData = playerMap.get(player);
                        // Simulated wins and win probability
                        playerData.simulatedWins += data.simulatedWins;
                        playerData.winProbability = playerData.simulatedWins / teamData.completedSimulations;

                        // Copy percentile / mode fields if present (these are updated only during percentile runs)
                        if (data.percentile_05 !== undefined) playerData.percentile_05 = data.percentile_05;
                        if (data.percentile_25 !== undefined) playerData.percentile_25 = data.percentile_25;
                        if (data.percentile_50 !== undefined) playerData.percentile_50 = data.percentile_50;
                        if (data.percentile_75 !== undefined) playerData.percentile_75 = data.percentile_75;
                        if (data.percentile_95 !== undefined) playerData.percentile_95 = data.percentile_95;
                        if (data.simulatedMin !== undefined) playerData.simulatedMin = data.simulatedMin;
                        if (data.simulatedMax !== undefined) playerData.simulatedMax = data.simulatedMax;
                        if (data.mode !== undefined) playerData.mode = data.mode;

                        // Copy the most common playoffTeams list and wins if present
                        if (data.mostCommonPlayoffTeams !== undefined) {
                            playerData.mostCommonPlayoffTeams = data.mostCommonPlayoffTeams;
                            playerData.mostCommonPlayoffTeamsWins = data.mostCommonPlayoffTeamsWins || 0;
                        }
                    }
                });
                          

                //Write number of simulations to console
                console.log(`Completed Simulations: ${teamData.completedSimulations}`);

                //If this is a percentile calculation, update the playerMap with the percentiles and update the expanded standings table
                if (e.data.percentilesCalculated) {
                    console.log("Percentiles calculated");
                    // (Fields already copied above) -- since we now copy percentiles and mode above
                }
                resolve(); // Resolve the promise when the worker sends its message
            };
        }));
    }

    // Post messages to all workers
    let needPercentilesCalculated = calculatePercentiles;
    workers.forEach(worker => {
        worker.postMessage({
            teamData: teamData,
            playerMap: playerMap,
            numSimulations: Math.ceil(simulationCount / NUM_WORKERS), // Number of simulations
            calculatePercentiles: needPercentilesCalculated
        });
        needPercentilesCalculated = false;
    });

    // Wait for all workers to finish
    await Promise.all(workerPromises);

    // Terminate all workers
    workers.forEach(worker => worker.terminate());

    return {playerMap, teamData}; // Return the updated playerMap
}



