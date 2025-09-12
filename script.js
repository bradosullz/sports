document.addEventListener('DOMContentLoaded', () => {
               
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

                        // If this is the standings table, show selected player below
                        if (table.id === 'standingsTable') {
                            var playerName = row.querySelector('td').textContent;
                            var playerTable = document.getElementById('selectedPlayerTable');
                            var playerNameCell = document.getElementById('selectedPlayerName');
                            playerNameCell.textContent = "Testing Tacos!"; //playerName;
                            playerTable.style.display = '';
                        }
                });
            });
        });
});