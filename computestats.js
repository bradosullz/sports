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



