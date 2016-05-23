import _ from 'lodash'
import moment from 'moment'

export default [
    {
        'id': 'medal-table',
        'paDeps': [
            'olympics/2016-summer-olympics/medal-table'
        ],
        'transform': medals => {
            var table = medals.olympics.games.medalTable.tableEntry.map(tableEntry => {
                return {
                    'position': parseInt(tableEntry.position),
                    'gold': parseInt(tableEntry.gold.value),
                    'silver': parseInt(tableEntry.silver.value),
                    'bronze': parseInt(tableEntry.bronze.value),
                    'country': tableEntry.country.identifier
                };
            });

            return {table};
        },
        'cacheTime': moment.duration(2, 'hours')
    },
    {
        'id': 'schedule',
        'paDeps': [
            'olympics/2016-summer-olympics/schedule'
        ],
        'paMoreDeps': schedule => {
            return schedule.olympics.schedule.map(day => {
                return 'olympics/2016-summer-olympics/schedule/' + day.date;
            });
        },
        'transform': (schedule, daySchedules) => {
            var disciplines = _(daySchedules)
                .flatMap((day, dayI) => {
                    var date = schedule.olympics.schedule[dayI].date;

                    return day.olympics.scheduledEvent.map(se => {
                        return {date, 'discipline': se.discipline.identifier};
                    });
                })
                .groupBy('discipline')
                .mapValues(dateEvents => _(dateEvents).map(e => e.date).sort().uniq().value())
                .map((dates, discipline) => { return {dates, 'name': discipline}; })
                .value();

            var dates = schedule.olympics.schedule.map(s => s.date);

            return {dates, disciplines};
        },
        'cacheTime': moment.duration(2, 'hours')
    }
];
