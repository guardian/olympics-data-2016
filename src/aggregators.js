import moment from 'moment'

export default [
    {
        'id': 'medal-table',
        'paDeps': [
            'olympics/2012-summer-olympics/medal-table'
        ],
        'transform': medalTable => medalTable,
        'cacheTime': moment.duration(2, 'hours')
    },
    {
        'id': 'test',
        'paDeps': [
            'olympics/2012-summer-olympics/schedule',
            'olympics/2012-summer-olympics/medal-table'

        ],
        'transform': (schedule, medals) => {
            return {'schedule': schedule.olympics.schedule, 'medals': medals.olympics.games.medalTable}
        },
        'cacheTime': moment.duration(2, 'seconds')
    }
];
