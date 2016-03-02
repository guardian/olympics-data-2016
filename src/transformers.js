import _ from 'lodash'

export default {
    medalTable(medals) {
        return medals;
    },

    test(schedule, medals) {
        return {'schedule': schedule.olympics.schedule, 'medals': medals.olympics.games.medalTable}
    }
};
