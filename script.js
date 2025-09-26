import { updateTeamData } from './computestats.js';

document.addEventListener('DOMContentLoaded', async () => {

    let teamData = [];
    const playerMap = new Map();
    const NUM_WORKERS = navigator.hardwareConcurrency ? navigator.hardwareConcurrency - 1 : 1;
    const INITIAL_SIMULATIONS = 16384; // 2^16 simulations for initial quick results
    const SUFFICIENT_SIMULATIONS = 16777216; // 2^24 simulations for high precision
    //const NUM_SIMULATIONS = 65536; // 2^20 simulations for better accuracy
    let completedSimulations = 0;

    
    // Fetch and update team data with probabilities from ESPN
    teamData = await updateTeamData(teamData);
    // Update the "Last Updated" timestamp to match the ESPN data
    const lastUpdatedDiv = document.getElementById('lastUpdated');
    if (lastUpdatedDiv) {
        const espnDate = new Date(teamData.lastUpdated);
        const formattedDate = espnDate.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        lastUpdatedDiv.textContent = `Last Updated: ${formattedDate}`;
    }



    /**
     * Populate the teams table with the updated team data
     */
    


    
    /**
     * Calculate standings table
     */

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

    // Populate the standings and expanded standings tables with the calculated player data
    populateStandingsTable(playerMap);
    populateExpandedStandingsTable(playerMap);

    // Populate the teams table with the updated team data
    populateTeamsTable(teamData);

    // Create a collection of Web Workers
    const workers = [];
    for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = new Worker('worker.js');
        workers.push(worker);
    }

    // Iterate through the workers, send the same data, and assign the same listener
    // One worker will also calculate percentiles
    let needPercentilesCalculated = true;
    workers.forEach(worker => {
        // Send data to the worker
        worker.postMessage({
            teamData: teamData,
            playerMap: playerMap,
            numSimulations: INITIAL_SIMULATIONS, // Number of simulations
            calculatePercentiles: needPercentilesCalculated
        });
        needPercentilesCalculated = false;
        // Listen for messages from the worker
        worker.onmessage = function(e) {
            const simulationPlayerMap = e.data.playerMap;
            completedSimulations += e.data.completedSimulations;

            // Update the number of simulated wins for each player
            simulationPlayerMap.forEach((data, player) => {
                if (playerMap.has(player)) {
                    playerMap.get(player).simulatedWins += data.simulatedWins;
                    playerMap.get(player).winProbability = playerMap.get(player).simulatedWins / completedSimulations;
                }
            });


            //Update win probabilities in the playerMap
            playerMap.forEach(playerData => {
                playerData.winProbability = playerData.simulatedWins / completedSimulations;
            });
            
            
            // Update the win probability column in Standings table after the simulation is complete
            const standingsTableBody = document.querySelector("#standingsTable tbody");
            Array.from(standingsTableBody.rows).forEach(row => {
                const playerName = row.cells[0].textContent;
                const playerData = playerMap.get(playerName);
                const precisionWinProbability = completedSimulations < SUFFICIENT_SIMULATIONS ? 0 : 1;
                if (playerData) {
                    row.cells[3].textContent = (playerData.winProbability * 100).toFixed(precisionWinProbability) + '% ';
                }
            });

            //Write number of simulations to console
            console.log(`Completed Simulations: ${completedSimulations}`);

            //If this is a percentile calculation, update the playerMap with the percentiles and update the expanded standings table
            if (e.data.percentilesCalculated) {
                console.log("Percentiles calculated");
                // Copy properties from e.data.playerMap for each player
                simulationPlayerMap.forEach((data, player) => {
                    if (playerMap.has(player)) {
                        const playerData = playerMap.get(player);
                        playerData.percentile_05 = data.percentile_05;
                        playerData.percentile_25 = data.percentile_25;
                        playerData.percentile_50 = data.percentile_50;
                        playerData.percentile_75 = data.percentile_75;
                        playerData.percentile_95 = data.percentile_95;
                        playerData.simulatedMin = data.simulatedMin;
                        playerData.simulatedMax = data.simulatedMax;
                        playerData.mode = data.mode;
                    }
                });
            }

            // Update the Expanded Standings table after the simulation is complete
            populateExpandedStandingsTable(playerMap);

            // If we haven't reached sufficient simulations, send doulbe the amount of simulations to the worker
            if (completedSimulations < SUFFICIENT_SIMULATIONS) {
                const nextSimulations = Math.min(e.data.completedSimulations * 2, Math.ceil((SUFFICIENT_SIMULATIONS - completedSimulations)  / NUM_WORKERS));
                worker.postMessage({
                    teamData: teamData,
                    playerMap: playerMap,
                    numSimulations: nextSimulations,
                    calculatePercentiles: false
                });
            }
        };
    });
    
    /**
     * Populates the standings table with data from a Map.
     * @param {Map<string, Object>} playerMap - The map containing player data.
     */
    function populateStandingsTable(playerMap) {
        // Get the table body element
        const tableBody = document.querySelector("#standingsTable tbody");

        // Clear any existing rows
        tableBody.innerHTML = '';

        // Loop through each player object in the map's values
        for (const playerData of playerMap.values()) {
            // Create a new table row
            const row = document.createElement("tr");

            // Create and append the Player cell
            const playerCell = document.createElement("td");
            playerCell.textContent = playerData.player;
            row.appendChild(playerCell);

            // Create and append the Expected Points cell
            const expectedPointsCell = document.createElement("td");
            // Format to 2 decimal places for readability
            expectedPointsCell.textContent = playerData.expectedPoints.toFixed(0);
            row.appendChild(expectedPointsCell);

            // Create and append the Most Likely Points cell
            const mostLikelyPointsCell = document.createElement("td");
            mostLikelyPointsCell.textContent = playerData.mostLikelyPoints;
            row.appendChild(mostLikelyPointsCell);

            // Create and append the Win PRobability cell with a placeholder
            const winProbabilityCell = document.createElement("td");
            winProbabilityCell.textContent = "...";
            row.appendChild(winProbabilityCell);

            // Append the completed row to the table body
            tableBody.appendChild(row);
        }
    }
 
    /**
     * Populates the teams table with the updated team data
     * @param {Array} allTeamData The full array of team data from the JSON file.
     */
    function populateTeamsTable(allTeamData) {
        const teamsTableBody = document.querySelector("#teamsTable tbody");
        teamsTableBody.innerHTML = ''; // Clear existing rows
    
        allTeamData.forEach(team => {
            const row = document.createElement("tr");

            // Team Name
            const teamCell = document.createElement("td");
            teamCell.textContent = team.Team;
            teamCell.classList.add("sticky-col");
            row.appendChild(teamCell);
            //Expected Points if Make Playoffs
            const expectedPointsMakeCell = document.createElement("td");
            expectedPointsMakeCell.textContent = (team.points_playoffs * team.probability_playoffs).toFixed(0);
            row.appendChild(expectedPointsMakeCell);
            // Expected Points if Miss Playoffs
            const expectedPointsMissCell = document.createElement("td");
            expectedPointsMissCell.textContent = (team.points_no_playoffs * (1 - team.probability_playoffs)).toFixed(0);
            row.appendChild(expectedPointsMissCell);
            //Full Points if Make Playoffs
            const fullPointsMakeCell = document.createElement("td");
            fullPointsMakeCell.textContent = team.points_playoffs;
            row.appendChild(fullPointsMakeCell);
            // Full Points if Miss Playoffs
            const fullPointsMissCell = document.createElement("td");
            fullPointsMissCell.textContent = team.points_no_playoffs;
            row.appendChild(fullPointsMissCell);
            // Playoff Probability
            const playoffProbCell = document.createElement("td");
            playoffProbCell.textContent = (team.probability_playoffs * 100).toFixed(1) + '%';
            row.appendChild(playoffProbCell);
            //Most Likely Scenario
            const mostLikelyCell = document.createElement("td");
            mostLikelyCell.textContent = team.most_likely_playoffs ? team.playoffs_type : 'Miss Playoffs';
            row.appendChild(mostLikelyCell);

            teamsTableBody.appendChild(row);

        });
    }
    
    /**
     * Populates the expanded standings table with data from a Map.
     * @param {Map<string, Object>} playerMap - The map containing player data.
     */
    function populateExpandedStandingsTable(playerMap) {
        const tableBody = document.querySelector("#expandedStandingsTable tbody");
        tableBody.innerHTML = ''; // Clear any existing rows

        for (const playerData of playerMap.values()) {
            const row = document.createElement("tr");

            // Player
            const playerCell = document.createElement("td");
            playerCell.textContent = playerData.player;
            playerCell.classList.add("sticky-col");
            row.appendChild(playerCell);

            // Win Probability
            const winProbabilityCell = document.createElement("td");
            const precisionWinProbability = completedSimulations < SUFFICIENT_SIMULATIONS ? 0 : 1;
            winProbabilityCell.textContent = (playerData.winProbability * 100).toFixed(precisionWinProbability) + '% ';
            row.appendChild(winProbabilityCell);

            // Min Points
            const minPointsCell = document.createElement("td");
            minPointsCell.textContent = playerData.minPoints;
            row.appendChild(minPointsCell);

            // 5th %ile
            const percentile05Cell = document.createElement("td");
            percentile05Cell.textContent = playerData.percentile_05 !== undefined ? playerData.percentile_05.toFixed(0) : '...';
            row.appendChild(percentile05Cell);

            // 25th %ile
            const percentile25Cell = document.createElement("td");
            percentile25Cell.textContent = playerData.percentile_25 !== undefined ? playerData.percentile_25.toFixed(0) : '...';
            row.appendChild(percentile25Cell);

            // Median
            const medianCell = document.createElement("td");
            medianCell.textContent = playerData.percentile_50 !== undefined ? playerData.percentile_50.toFixed(0) : '...';
            row.appendChild(medianCell);

            // 75th %ile
            const percentile75Cell = document.createElement("td");
            percentile75Cell.textContent = playerData.percentile_75 !== undefined ? playerData.percentile_75.toFixed(0) : '...';
            row.appendChild(percentile75Cell);

            // 95th %ile
            const percentile95Cell = document.createElement("td");
            percentile95Cell.textContent = playerData.percentile_95 !== undefined ? playerData.percentile_95.toFixed(0) : '...';
            row.appendChild(percentile95Cell);

            // Max Points
            const maxPointsCell = document.createElement("td");
            maxPointsCell.textContent = playerData.maxPoints;
            row.appendChild(maxPointsCell);

            // Mode
            const modeCell = document.createElement("td");
            modeCell.textContent = playerData.mode !== undefined ? playerData.mode.join(', ') : '...';
            row.appendChild(modeCell);

            tableBody.appendChild(row);
        }

        // Sort the table after populating
        const expandedStandingsTable = document.getElementById('expandedStandingsTable');
        const currentSortHeader = expandedStandingsTable.querySelector('th[data-sort-dir]');
        if (currentSortHeader) {
            const columnIndex = parseInt(currentSortHeader.dataset.column, 10);
            const direction = currentSortHeader.dataset.sortDir;
            sortTableByColumn(expandedStandingsTable, columnIndex, direction);
        }
    }

    /**
     * Populates the selected player's table with teams they picked to make the playoffs.
     * @param {string} playerName The name of the selected player (e.g., "AK").
     * @param {Array} allTeamData The full array of team data from the JSON file.
     */
    const populatePlayerPicks = (playerName, allTeamData) => {
        const playerTableMakes = document.getElementById('selectedPlayerTableMakes');
        const playerTableMisses = document.getElementById('selectedPlayerTableMisses');
        const tableBodyMakes = playerTableMakes.querySelector('tbody');
        const tableBodyMisses = playerTableMisses.querySelector('tbody');
        const playerNameHeaderMakes = document.getElementById('selectedPlayerNameMakes');
        const playerNameHeaderMisses = document.getElementById('selectedPlayerNameMisses');

        // Clear any previous data from the table body
        tableBodyMakes.innerHTML = '';
        tableBodyMisses.innerHTML = '';

        // Update the table's main header with the selected player's name
        playerNameHeaderMakes.textContent = `${playerName}'s "Make Playoffs" Picks`;
        playerNameHeaderMisses.textContent = `${playerName}'s "Miss Playoffs" Picks`;

        // Filter the data to find only the teams this player picked
        const playerPicksMakes = allTeamData.filter(team =>
            team.players_list_make_playoffs && team.players_list_make_playoffs.includes(playerName)
        );
        const playerPicksMisses = allTeamData.filter(team =>
            team.players_list_miss_playoffs && team.players_list_miss_playoffs.includes(playerName)
        );

        // Create and append a table row for each of the player's Make Playoffs picks
        playerPicksMakes.forEach(team => {
            const row = tableBodyMakes.insertRow();

            // 1. Team Column
            const cellTeam = row.insertCell();
            cellTeam.textContent = team.Team;

            // 2. Expected Points Column
            const cellExpectedPoints = row.insertCell();
            cellExpectedPoints.textContent = (team.probability_playoffs * team.points_playoffs).toFixed(0)

            // 3. Full Points Column
            const cellFullPoints = row.insertCell();
            cellFullPoints.textContent = team.points_playoffs;

            // 4. Playoff Probability Column
            const cellProbability = row.insertCell();
            // Format the number as a percentage with 2 decimal places
            const probabilityPercent = (team.probability_playoffs * 100).toFixed(1);
            cellProbability.textContent = `${probabilityPercent}%`;
        });

        // Create and append a table row for each of the player's Miss Playoffs picks
        playerPicksMisses.forEach(team => {
            const row = tableBodyMisses.insertRow();

            // 1. Team Column
            const cellTeam = row.insertCell();
            cellTeam.textContent = team.Team;

            // 2. Expected Points Column
            const cellExpectedPoints = row.insertCell();
            cellExpectedPoints.textContent = ((1 - team.probability_playoffs) * team.points_no_playoffs).toFixed(0)
            
            // 3. Full Points Column
            const cellPoints = row.insertCell();
            cellPoints.textContent = team.points_no_playoffs;

            // 4. Playoff Probability Column
            const cellProbability = row.insertCell();
            // Format the number as a percentage with 2 decimal places
            const probabilityPercent = ((1 - team.probability_playoffs) * 100).toFixed(1);
            cellProbability.textContent = `${probabilityPercent}%`;
        });

        // Make the table visible
        playerTableMakes.style.display = 'table';
        playerTableMisses.style.display = 'table';

        // Sort the tables by Expected Points in descending order
        sortTableByColumn(playerTableMakes, 1, 'desc');
        sortTableByColumn(playerTableMisses, 1, 'desc');
    };

    /**
     * Sorts an HTML table.
     * @param {HTMLTableElement} table The table to sort
     * @param {number} column The index of the column to sort
     * @param {string} dir The direction to sort ('asc' or 'desc')
     */
    function sortTableByColumn(table, column, dir) {
        const tbody = table.tBodies[0];
        const rows = Array.from(tbody.querySelectorAll("tr"));

        const sortedRows = rows.sort((a, b) => {
            const aColText = a.querySelector(`td:nth-child(${column + 1})`).textContent.trim();
            const bColText = b.querySelector(`td:nth-child(${column + 1})`).textContent.trim();

            const aVal = parseFloat(aColText);
            const bVal = parseFloat(bColText);

            // Handle numeric or string comparison
            const valA = isNaN(aVal) ? aColText.toLowerCase() : aVal;
            const valB = isNaN(bVal) ? bColText.toLowerCase() : bVal;

            if (valA < valB) {
                return dir === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return dir === 'asc' ? 1 : -1;
            }
            return 0;
        });

        // Re-append sorted rows
        tbody.innerHTML = "";
        sortedRows.forEach(row => tbody.appendChild(row));
    };

    // Apply sorting to all tables in the document
    document.querySelectorAll('table').forEach(table => {
        const headers = table.querySelectorAll('th');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const columnIndex = parseInt(header.dataset.column, 10);
                const currentDir = header.dataset.sortDir;
                const newDir = currentDir === 'asc' ? 'desc' : 'asc';

                // Reset all header sort attributes for this table
                headers.forEach(h => h.removeAttribute('data-sort-dir'));

                // Set the new sort direction on the clicked header
                header.dataset.sortDir = newDir;

                sortTableByColumn(table, columnIndex, newDir);
            });
        });
    });

    // Initial default sort for all columns with default sort direction
    document.querySelectorAll('th[data-sort-dir]').forEach(header => {
        const parentTable = header.closest('table');
        if (!parentTable) return;
        const columnIndex = parseInt(header.dataset.column, 10);
        const direction = header.dataset.sortDir;
        sortTableByColumn(parentTable, columnIndex, direction);
    });

    // Make all rows in all tables selectable and highlight on click
    document.querySelectorAll('table').forEach(function(table) {
        table.querySelectorAll('tbody tr').forEach(function(row) {
            row.addEventListener('click', function() {
                table.querySelectorAll('tbody tr').forEach(function(r) {
                    r.classList.remove('selected-row');
                });
                row.classList.add('selected-row');

                // If this is the standings table, populate the player picks table
                if (table.id === 'standingsTable') {
                    const playerName = row.querySelector('td').textContent;
                    // Call the new function to populate the table using the fetched data
                    populatePlayerPicks(playerName, teamData);
                }
            });
        });
    });

});

function openTab(evt, tabName) {
    var i, tabcontent, tablinks;

    // Get all elements with class="tabcontent" and hide them
    tabcontent = document.querySelectorAll('table');
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Get all elements with class="tablinks" and remove the class "active"
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    if (tabName === 'Standings') {
        document.getElementById('standingsTable').style.display = "table";
        // Check if a row is selected in standingsTable and show player picks tables
        const selectedRow = document.querySelector('#standingsTable .selected-row');
        if (selectedRow) {
            document.getElementById('selectedPlayerTableMakes').style.display = "table";
            document.getElementById('selectedPlayerTableMisses').style.display = "table";
        }
    } else if (tabName === 'Expanded Standings') {
        document.getElementById('expandedStandingsTable').style.display = "table";
    } else if (tabName === 'Teams') {
        document.getElementById('teamsTable').style.display = "table";
    }
    evt.currentTarget.className += " active";
}

// Set default tab to Standings on initial load
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.tablinks.active').click();
});

// Ensure openTab function is globally accessible
window.openTab = openTab;

