import _ from 'lodash'
import moment from 'moment'
import fs from 'fs'
import config from '../../config'

export default [
    {
        'id': 'scheduleAll',
        'paDeps': [],
        'paMoreDeps': [],
        'transform': () => {
        },
        'cacheTime': moment.duration(2, 'hours')
    }
];
