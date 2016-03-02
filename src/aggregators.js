import moment from 'moment'

export default [
    {
        'id': 'medal-table',
        'paDeps': [
            'olympics/2012-summer-olympics/medal-table'
        ],
        'transform': medals => {
            return medals.olympics.games.medalTable.tableEntry.map(tableEntry => {
                return {
                    'position': parseInt(tableEntry.position),
                    'gold': parseInt(tableEntry.gold.value),
                    'silver': parseInt(tableEntry.silver.value),
                    'bronze': parseInt(tableEntry.bronze.value),
                    'country': tableEntry.country.identifier
                };
            });
        },
        'cacheTime': moment.duration(2, 'hours')
    }
];
