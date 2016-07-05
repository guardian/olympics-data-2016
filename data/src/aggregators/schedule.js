import _ from 'lodash'
import moment from 'moment'
import fs from 'fs'
import config from '../../config'
import assert from 'assert'

const phaseId = evt => evt.discipline.event.eventUnit.phaseDescription.identifier;
const unitId = evt => evt.discipline.event.eventUnit.identifier;

function calcSuperEvent(evts, evt1) {
    return evts.find(evt2 => {
        return phaseId(evt1) === phaseId(evt2) && evt1.start.utc >= evt2.start.utc && evt1.end.utc <= evt2.end.utc
    });
}

function exportEvent(evt) {
    let out = {
        'unitId': unitId(evt),
        'name': evt.description,
        'start': evt.start.utc,
        'end': evt.end.utc,
        'status': evt.status
    };
    if (evt.subEvents && evt.subEvents.length > 0) out.subEvents = evt.subEvents.map(exportEvent);

    return out;
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
                .map(([schedule, dateSchedule], dateNo) => {
                    let disciplines = _(dateSchedule.olympics.scheduledEvent)
                        .groupBy('discipline.identifier')
                        .map(disciplineEvents => {
                            let discipline = disciplineEvents[0].discipline;

                            // some event units seem to be aggregate units
                            // any event units which are part of the same phase which are entirely contained
                            // within another event unit will become "sub-event units"
                            let events = _(disciplineEvents)
                                .map(evt => { return {...evt, 'superEvent': calcSuperEvent(disciplineEvents, evt)}; })
                                .groupBy(evt => unitId(evt.superEvent))
                                .flatMap(superEventUnits => {
                                    let [superEvents, subEvents] = _.partition(superEventUnits, evt => unitId(evt) === unitId(evt.superEvent))
                                    assert(superEvents.length === 1);

                                    let superEvent = superEvents[0];
                                    return {...superEvent, subEvents};
                                })
                                .map(exportEvent)
                                .valueOf();

                            return {
                                'disciplineName': discipline.description,
                                'disciplineId': discipline.identifier,
                                events
                            };
                        })
                        .valueOf();

                    return {
                        'date': schedule.date,
                        dateNo, disciplines
                    };
                });
        },
        'cacheTime': moment.duration(2, 'hours')
    }
];
