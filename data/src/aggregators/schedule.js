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

function forceArray(arr) {
    return _.isArray(arr) ? arr : [arr];
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
                    console.log(schedule.date);
                    let disciplines = _(forceArray(dateSchedule.olympics.scheduledEvent))
                        // TODO: remove filter when PA updates
                        .filter(evt => !evt.discipline.event.eventUnit.identifier.endsWith('00'))
                        .filter(evt => evt.status !== 'Cancelled')
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

                            let venues = _.uniqBy(events.map(evt => evt.venue), venue => venue.identifier);

                            return {
                                'identifier': disciplineEvents[0].discipline.identifier,
                                'description': disciplineEvents[0].discipline.description,
                                events, venues
                            };
                        })
                        .valueOf();

                    return {'date': schedule.date, disciplines};
                });
        },
        'cacheTime': moment.duration(2, 'hours')
    },
    {
        'id': 'startLists',
        'paDeps': ['olympics/2016-summer-olympics/schedule'],
        'paMoreDeps': [
            dates => {
                return dates.olympics.schedule.map(s => `olympics/2016-summer-olympics/schedule/${s.date}`);
            },
            (a, dateSchedules) => {
                return _.flatMap(dateSchedules, s => forceArray(s.olympics.scheduledEvent))
                    .filter(evt => evt.startListAvailable === 'Yes')
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.discipline.event.eventUnit.identifier}/start-list`)
                    .slice(0, 100) // TODO: remove
            }
        ],
        'transform': (a, b, startLists) => {
            return _(startLists)
                .map(startList => startList.olympics.eventUnit)
                .map(eventUnit => [eventUnit.identifier, forceArray(eventUnit.startList.entrant)])
                .fromPairs()
                .valueOf();
        },
        'cacheTime': moment.duration(1, 'hour')
    },
    {
        'id': 'results',
        'paDeps': ['olympics/2016-summer-olympics/schedule'],
        'paMoreDeps': [
            dates => {
                return dates.olympics.schedule.map(s => `olympics/2016-summer-olympics/schedule/${s.date}`);
            },
            (a, dateSchedules) => {
                return _.flatMap(dateSchedules, s => forceArray(s.olympics.scheduledEvent))
                    .filter(evt => evt.resultAvailable === 'Yes')
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.discipline.event.eventUnit.identifier}/result`)
                    .slice(0, 100) // TODO: remove
            }
        ],
        'transform': (a, b, results) => {
            return _(results)
                .map(result => result.olympics.eventUnit)
                .map(eventUnit => [eventUnit.identifier, forceArray(eventUnit.result.entrant)])
                .fromPairs()
                .valueOf();
        },
        'cacheTime': moment.duration(10, 'minutes')
    }
];
