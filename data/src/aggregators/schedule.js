import _ from 'lodash'
import moment from 'moment'
import 'moment-range'
import fs from 'fs'
import config from '../../config'
import assert from 'assert'

const combineBlacklist = ['football', 'water-polo', 'hockey', 'volleyball', 'basketball'];

function canCombine(group, evt1) {
    if (group && combineBlacklist.indexOf(evt1.discipline.identifier) === -1) {
        let evt2 = group[0];

        return evt1.phase.identifier === evt2.phase.identifier &&
            evt1.venue.identifier === evt2.venue.identifier &&
            evt1.start >= evt2.start &&
            moment(evt1.start).subtract(10, 'minutes').isSameOrBefore(evt2.end)
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
                        // TODO: remove filter when PA updates
                        .filter(evt => !evt.discipline.event.eventUnit.identifier.endsWith('00'))
                        .map(evt => {
                            return {
                                'description': evt.description,
                                'start': evt.start.utc,
                                'end': evt.end.utc,
                                'venue': evt.venue,
                                'phase': evt.discipline.event.eventUnit.phaseDescription,
                                'event': _.pick(evt.discipline.event, ['description']),
                                'discipline': _.pick(evt.discipline, ['identifier', 'description'])
                            };
                        })
                        .groupBy('discipline.identifier')
                        .map(disciplineEvents => {
                            let events = _.sortBy(disciplineEvents, evt => `${evt.phase.identifier}:${evt.start}`)
                                .reduce((groups, evt) => {
                                    let [group, ...otherGroups] = groups;
                                    return canCombine(group, evt) ?
                                        [[evt, ...group], ...otherGroups] : [[evt], ...groups];
                                }, [])
                                .map(group => {
                                    let first = group[0];
                                    if (group.length === 1) {
                                        return first;
                                    } else {
                                        let description = `${first.event.description} ${first.phase.value}`;
                                        let start = _.min(group.map(evt => evt.start));
                                        let end = _.max(group.map(evt => evt.end));
                                        return {...first, description, start, end, group};
                                    }
                                })
                                .sort((a, b) => a.start < b.start ? -1 : 1);

                            return {
                                //'id': disciplineEvents[0].discipline.identifier,
                                'description': disciplineEvents[0].discipline.description,
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
