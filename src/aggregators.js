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
                    'countryCode': tableEntry.country.identifier,
                    'country': tableEntry.country.name
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
    },
    {
        'id': 'recent-medals',
        'paDeps': [
            'olympics/2016-summer-olympics/medal-cast'
        ],
        'transform': medals => {
            console.log(medals.olympics.games.medalCast)
            var list = medals.olympics.games.medalCast.map(tableEntry => {
                return {
                    "medal": tableEntry.type,
                    "date":tableEntry.date,
                    "time":tableEntry.time,
                    "countryCode":tableEntry.entrant.country.identifier,
                    "country": tableEntry.entrant.country.name,
                    "athlete":tableEntry.entrant.participant ? tableEntry.entrant.participant.competitor.fullName : null,
                    "discipline":tableEntry.event.disciplineDescription.value,
                    "disciplineDescription":tableEntry.event.description
                }
            });

            return {list};
        },
        'cacheTime': moment.duration(1, 'hours')
    },{
        'id': 'medal-table-disciplines',
        'paDeps': [
            'olympics/2016-summer-olympics/discipline'
        ],
        'paMoreDeps': discipline => {
            return discipline.olympics.discipline.filter(discipline => {
                return discipline.identifier !== "cycling-mountain-bike"
            }).map(discipline => {
                return 'olympics/2016-summer-olympics/discipline/' + discipline.identifier + '/medal-table/';
            });
        },
        'transform': (disciplines,medals) => {
            var disciplines = medals.map(discipline => {
                return {
                    "discipline": discipline.olympics.discipline.description,
                    "medal-table": discipline.olympics.discipline.medalTable.tableEntry
                }
            })
            return {disciplines};
        },
        'cacheTime': moment.duration(2, 'hours')
    }
];
