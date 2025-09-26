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

    return teamData;
}



