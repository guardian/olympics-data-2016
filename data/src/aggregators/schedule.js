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

function getCompetitors(entrant) {
    let participants = entrant.participant ? forceArray(entrant.participant) : [];
    return participants.map(p => p.competitor);
}

function forceArray(arr) {
    return arr === undefined ? [] : _.isArray(arr) ? arr : [arr];
}

function parseEntrants(entrants) {
    return _(entrants)
        .filter(entrant => entrant.code !== 'NOCOMP')
        .map(entrant => {
            let properties = _(forceArray(entrant.property || []))
                .map(p => [p.type, p.value])
                .fromPairs()
                .valueOf();

            return {
                'order': parseInt(entrant.order),
                'type': entrant.type,
                'competitors': getCompetitors(entrant), // forceArray(entrant.participant).map(p => p ? p.competitor : null),
                'countryCode': entrant.country.identifier,
                'countryName': entrant.country.name,
                'medal': properties['Medal Awarded']
            };
        })
        .sortBy('order')
        .valueOf();
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
                                'unit': _.pick(evt.discipline.event.eventUnit, ['identifier']),
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
        'cacheTime': moment.duration(1, 'hour')
    },
    {
        'id': 'startLists',
        'paDeps': ['olympics/2016-summer-olympics/schedule'],
        'paMoreDeps': [
            dates => dates.olympics.schedule.map(s => `olympics/2016-summer-olympics/schedule/${s.date}`),
            (a, dateSchedules) => {
                return _.flatMap(dateSchedules, s => forceArray(s.olympics.scheduledEvent))
                    .filter(evt => evt.startListAvailable === 'Yes')
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.discipline.event.eventUnit.identifier}/start-list`)
            }
        ],
        'transform': (a, b, startLists) => {
            return _(startLists)
                .map(startList => startList.olympics.eventUnit)
                .map(eventUnit => [eventUnit.identifier, forceArray(eventUnit.startList.entrant)])
                .fromPairs()
                .valueOf();
        },
        'cacheTime': moment.duration(30, 'minutes')
    },
    {
        'id': 'results',
        'paDeps': ['olympics/2016-summer-olympics/schedule'],
        'paMoreDeps': [
            dates => dates.olympics.schedule.map(s => `olympics/2016-summer-olympics/schedule/${s.date}`),
            (a, dateSchedules) => {
                return _.flatMap(dateSchedules, s => forceArray(s.olympics.scheduledEvent))
                    .filter(evt => evt.resultAvailable === 'Yes')
                    .map(evt => `olympics/2016-summer-olympics/event-unit/${evt.discipline.event.eventUnit.identifier}/result`)
            }
        ],
        'transform': (a, b, results) => {
            return _(results)
                .map(result => result.olympics.eventUnit)
                .map(eventUnit => [eventUnit.identifier, parseEntrants(forceArray(eventUnit.result.entrant))])
                .fromPairs()
                .valueOf();
        },
        'cacheTime': moment.duration(5, 'minutes')
    }
];
