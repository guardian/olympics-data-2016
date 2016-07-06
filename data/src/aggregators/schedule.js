import _ from 'lodash'
import moment from 'moment'
import 'moment-range'
import fs from 'fs'
import config from '../../config'
import assert from 'assert'

const phaseId = evt => evt.discipline.event.eventUnit.phaseDescription.identifier;
const unitId = evt => evt.discipline.event.eventUnit.identifier;

function canCombine(group, evt1) {
    if (group) {
        let evt2 = group[0];
        return evt1.phaseId === evt2.phaseId &&
            evt1.venue.identifier === evt2.venue.identifier &&
            (evt1.start >= evt2.start && evt1.start <= evt2.end ||
             evt1.end >= evt2.start && evt1.end <= evt2.end);
    }
    return false;
}

export default [
    {
        'id': 'scheduleAll',
        'paDeps': ['olympics/2016-summer-olympics/schedule'],
        'paMoreDeps': [
            dates => {
                return dates.olympics.schedule
                    .sort((a, b) => a.date < b.date ? -1 : 1)
                    .map(s => `olympics/2016-summer-olympics/schedule/${s.date}`);
            }
        ],
        'transform': (dates, dateSchedules) => {
            return _.zip(dates.olympics.schedule, dateSchedules)
                .map(([schedule, dateSchedule]) => {
                    let disciplines = _(dateSchedule.olympics.scheduledEvent)
                        .groupBy('discipline.identifier')
                        .map(disciplineEvents => {
                            let discipline = disciplineEvents[0].discipline;

                            let events = _(disciplineEvents)
                                .map(evt => {
                                    return {
                                        'name': evt.description,
                                        'start': evt.start.utc,
                                        'end': evt.end.utc,
                                        'status': evt.status,
                                        'unitId': unitId(evt),
                                        'phaseId': phaseId(evt),
                                        'venue': evt.venue
                                    };
                                })
                                .sortBy(evt => `${evt.phaseId}:${evt.start}`)
                                .reduce((groups, evt) => {
                                    let [group, ...otherGroups] = groups;
                                    return canCombine(group, evt) ?
                                        [[evt, ...group], ...otherGroups] : [[evt], ...groups];
                                }, [])
                                .map(group => {
                                    let name = _.maxBy(group, evt => moment(evt.end).diff(evt.start)).name;
                                    let start = _.min(group.map(evt => evt.start));
                                    let end = _.max(group.map(evt => evt.end));
                                    return {
                                        name, start, end,
                                        'group': group.sort((a, b) => a.start < b.start ? -1 : 1),
                                        'status': group[0].status,
                                        'venue': group[0].venue
                                    };
                                })
                                .sort((a, b) => a.start < b.start ? -1 : 1);

                            return {
                                'name': discipline.description,
                                'id': discipline.identifier,
                                events
                            };
                        })
                        .valueOf();

                    return {'date': schedule.date, disciplines};
                });
        },
        'cacheTime': moment.duration(2, 'hours')
    }
];
