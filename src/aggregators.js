import _ from 'lodash'
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
    },
    {
        'id': 'schedule',
        'paDeps': [
            'olympics/2012-summer-olympics/schedule'
        ],
        'paMoreDeps': schedule => {
            return schedule.olympics.schedule.map(day => {
                return 'olympics/2012-summer-olympics/schedule/' + day.date;
            });
        },
        'transform': (schedule, days) => {
            return days.map((day, dayI) => {
                var date = schedule.olympics.schedule[dayI].date;
                var events = day.olympics.scheduledEvent.map(se => se.discipline.identifier);

                return {date, 'events': _.uniq(events)};
            });
        },
        'cacheTime': moment.duration(2, 'hours')
    }
];
