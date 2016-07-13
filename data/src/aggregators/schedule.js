import _ from 'lodash'
import moment from 'moment'

function forceArray(arr) {
    return arr === undefined ? [] : _.isArray(arr) ? arr : [arr];
}

function getEventUnit(evt) {
    return evt.discipline.event.eventUnit;
}

function parseScheduledEvent(evt) {
    let eventUnit = getEventUnit(evt);
    return {
        'description': evt.description,
        'start': evt.start.utc,
        'end': evt.end.utc,
        'venue': evt.venue,
        'unit': _.pick(eventUnit, ['identifier']),
        'phase': eventUnit.phaseDescription,
        'event': _.pick(evt.discipline.event, ['description']),
        'discipline': _.pick(evt.discipline, ['identifier', 'description'])
    };
}

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

function combineEvents(evts) {
    let combinedEvents = _(evts)
        .sortBy(evt => `${evt.phase.identifier}:${evt.start}`)
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
        .sort((a, b) => a.start < b.start ? -1 : 1)
        .valueOf();
    return combinedEvents;
}

function getCompetitors(entrant) {
    let participants = entrant.participant ? forceArray(entrant.participant) : [];
    return participants.map(p => p.competitor);
}

function parseEntrants(entrants) {
    return _(entrants)
        .filter(entrant => entrant.code !== 'NOCOMP' && entrant.code !== 'BYE')
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

function getScheduleDates(dates) {
    return dates.olympics.schedule
        .sort((a, b) => a.date < b.date ? -1 : 1)
        .map(s => `olympics/2016-summer-olympics/schedule/${s.date}`);
}

const paTestDone = ['archery', 'athletics', 'badminton', 'boxing', 'cycling-bmx', 'canoe-sprint', 'cycling-mountain-bike', 'cycling-road', 'canoe-slalom', 'cycling-track', 'diving', 'equestrian', 'football', 'fencing', 'gymnastics-artistic', 'gymnastics-rhythmic', 'gymnastics-trampoline'];

export default [
    {
        'id': 'scheduleAll',
        'paDeps': ['olympics/2016-summer-olympics/schedule'],
        'paMoreDeps': [getScheduleDates],
        'transform': (dates, dateSchedules) => {
            return _.zip(dates.olympics.schedule, dateSchedules)
                .map(([schedule, dateSchedule], dateNo) => {
                    let events = forceArray(dateSchedule.olympics.scheduledEvent)
                        .filter(evt => !getEventUnit(evt).identifier.endsWith('00'))
                        .filter(evt => evt.status !== 'Cancelled')
                        .map(parseScheduledEvent);

                    let disciplines = _(events)
                        .groupBy('discipline.identifier')
                        .map(disciplineEvents => {
                            let events = combineEvents(disciplineEvents);
                            let venues = _(events).map('venue').uniqBy('identifier').valueOf();
                            return {
                                'identifier': disciplineEvents[0].discipline.identifier,
                                'description': disciplineEvents[0].discipline.description,
                                events, venues
                            };
                        })
                        .valueOf();

                    return {'date': schedule.date, dateNo, disciplines};
                });
        },
        'cacheTime': moment.duration(1, 'hour')
    },
    {
        'id': 'startLists',
        'paDeps': ['olympics/2016-summer-olympics/schedule'],
        'paMoreDeps': [
            getScheduleDates,
            (a, dateSchedules) => {
                let events = _.flatMap(dateSchedules, s => forceArray(s.olympics.scheduledEvent));
                let urls = events
                    .filter(evt => evt.startListAvailable === 'Yes')
                    .filter(evt => paTestDone.indexOf(evt.discipline.identifier) === -1)
                    .map(evt => getEventUnit(evt).identifier)
                    .map(eventUnit => `olympics/2016-summer-olympics/event-unit/${eventUnit}/start-list`);
                return urls;
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
            getScheduleDates,
            (a, dateSchedules) => {
                let events = _.flatMap(dateSchedules, s => forceArray(s.olympics.scheduledEvent));
                let urls = events
                    .filter(evt => evt.resultAvailable === 'Yes')
                    .filter(evt => paTestDone.indexOf(evt.discipline.identifier) === -1)
                    .map(evt => getEventUnit(evt).identifier)
                    .map(unitId => `olympics/2016-summer-olympics/event-unit/${unitId}/result`);
                return urls;
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
