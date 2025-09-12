document.addEventListener('DOMContentLoaded', async () => {

    let teamData = [];

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

            // 2. Points Column
            const cellPoints = row.insertCell();
            cellPoints.textContent = team.points_playoffs;

            // 3. Playoff Probability Column
            const cellProbability = row.insertCell();
            // Format the number as a percentage with 2 decimal places
            const probabilityPercent = (team.probability_playofffs * 100).toFixed(2);
            cellProbability.textContent = `${probabilityPercent}%`;
        });

        // Create and append a table row for each of the player's Miss Playoffs picks
        playerPicksMisses.forEach(team => {
            const row = tableBodyMisses.insertRow();

            // 1. Team Column
            const cellTeam = row.insertCell();
            cellTeam.textContent = team.Team;

            // 2. Points Column
            const cellPoints = row.insertCell();
            cellPoints.textContent = team.points_no_playoffs;

            // 3. Playoff Probability Column
            const cellProbability = row.insertCell();
            // Format the number as a percentage with 2 decimal places
            const probabilityPercent = ((1 - team.probability_playofffs) * 100).toFixed(2);
            cellProbability.textContent = `${probabilityPercent}%`;
        });

        // Make the table visible
        playerTableMakes.style.display = 'table';
        playerTableMisses.style.display = 'table';
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

    const table = document.getElementById('standingsTable');
    const headers = table.querySelectorAll('th');

    headers.forEach(header => {
        header.addEventListener('click', () => {
            const columnIndex = parseInt(header.dataset.column, 10);
            const currentDir = header.dataset.sortDir;
            const newDir = currentDir === 'asc' ? 'desc' : 'asc';

            // Reset all header sort attributes
            headers.forEach(h => h.removeAttribute('data-sort-dir'));

            // Set the new sort direction on the clicked header
            header.dataset.sortDir = newDir;

            sortTableByColumn(table, columnIndex, newDir);
        });
    });

    // Initial default sort
    const defaultSortHeader = document.querySelector('th[data-sort-dir]');
    if (defaultSortHeader) {
        const defaultColumnIndex = parseInt(defaultSortHeader.dataset.column, 10);
        const defaultDirection = defaultSortHeader.dataset.sortDir;
        sortTableByColumn(table, defaultColumnIndex, defaultDirection);
    }

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