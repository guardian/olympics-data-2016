import _ from 'lodash'
import moment from 'moment'
import fs from 'fs'
import config from '../../config'

let path = config.pa.baseUrl.indexOf('uat') > -1 ? 'olympics/2016-summer-olympics' : 'olympics/2012-summer-olympics'

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
