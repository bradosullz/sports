document.addEventListener('DOMContentLoaded', async () => {

    let teamData = [];
    let probabilityData = [];
    const playerMap = new Map();

    // Fetches team data from the specified URL when the page loads.
    try {
        const response = await fetch('https://bradosullz.github.io/sports/teaminfo.json');
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

    // Update the "Last Updated" timestamp to match the ESPN data
    const lastUpdatedDiv = document.getElementById('lastUpdated');
    if (lastUpdatedDiv) {
        const espnDate = new Date(probabilityData.lastUpdated);
        const formattedDate = espnDate.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        lastUpdatedDiv.textContent = `Last Updated: ${formattedDate}`;
    }

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
    }
    }

    // Filter out division winners from the remaining teams
    const remainingAFCTeams = afcTeams.filter(team => !team.most_likely_playoffs);
    const remainingNFCTeams = nfcTeams.filter(team => !team.most_likely_playoffs);

    // Calculate a new metric for the remaining teams
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
    }
    for (let i = 0; i < 3 && i < remainingNFCTeams.length; i++) {
    remainingNFCTeams[i].most_likely_playoffs = true;
    }

    // For all other teams, set most_likely_playoffs to false
    teamData.forEach(team => {
    if (typeof team.most_likely_playoffs === 'undefined') {
        team.most_likely_playoffs = false;
    }
    });
    
    
    
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
        maxPoints: 0
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
        });
    }
    });

    // Populate the standings table with the calculated player data
    populateStandingsTable(playerMap);
    
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

            // Create and append the Maximum Points cell
            const maxPointsCell = document.createElement("td");
            maxPointsCell.textContent = playerData.maxPoints;
            row.appendChild(maxPointsCell);

            // Append the completed row to the table body
            tableBody.appendChild(row);
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
    const sortTableByColumn = (table, column, dir) => {
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