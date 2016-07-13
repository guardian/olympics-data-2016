import { $, $$ } from './lib/selector'
import reqwest from 'reqwest'

let lbButton = $('.js-leaderboard-button')
let rButton = $('.js-recent-button')
let countries = $$('.om-table-row')

let daysCached = null
let resultsCached = {}

function yesterday(dayStr){
    let date = new Date(dayStr)
    return (new Date(date - 24*3600*1000)).toISOString().slice(0,10)
}

function filterEls() {

    let id_ = dSelect.options[dSelect.selectedIndex].value
    let disciplines = $$('.om-recent-discipline')
    let sections = $$('.om-recent-day-section')

    // sections.forEach(ev => {
    //     if (id_ === '' || id_ === ev.getAttribute('data-discipline')) {
    //         ev.classList.remove('is-hidden')
    //     } else {
    //         ev.classList.add('is-hidden')
    //     }
    // })

    disciplines.forEach(ev => {
        if (id_ === '' || id_ === ev.getAttribute('data-discipline')) {
            ev.classList.remove('is-hidden')
        } else {
            ev.classList.add('is-hidden')
        }
    })
} 

function addResultHandlers() {

    $$('.js-results-button').forEach( el => {
        el.addEventListener('click', () => {
            let euid = el.getAttribute('data-euid');
            if(el.classList.contains('hide-button')) {
                console.log(el.parentElement)
                let table = el.parentElement.querySelector('.om-results-table')
                table.classList.add('is-hidden')
            }
            else {
                let p = resultsCached[euid] ? Promise.resolve(resultsCached[euid]) : Promise.resolve(reqwest(`./eventunits/results-${euid}.html`))
                p.then(resp => {
                    el.parentElement.insertAdjacentHTML('beforeEnd', resp);
                });

                el.classList.toggle('hide-button');
            }
        })
    })
}


lbButton.addEventListener('click', e => {
    countries
    .filter(el => el.getAttribute('data-position') > 10)
    .forEach(function(el){
        el.classList.toggle('om-table-row--hidden')
    })
    lbButton.innerHTML = (lbButton.innerHTML === 'Hide countries') ? 'All countries' : 'Hide countries'
    console.log(lbButton.classList)
    lbButton.classList.toggle('hide-button')
})

let dSelect = $('.om-select-discipline')
let cSelect = $('.om-select-country')
let recentContainer = $('.om-recent-days')
let countryContainer = $('.om-country')

dSelect.addEventListener('change', () => {
    countryContainer.classList.add('is-hidden')
    recentContainer.classList.remove('is-hidden')
    cSelect.selectedIndex = 0
    filterEls()
})

cSelect.addEventListener('change', () => {

    let countryCode = cSelect.options[cSelect.selectedIndex].value
    console.log(countryCode)
    if(countryCode !== ''){
        dSelect.selectedIndex = 0
        let p = Promise.resolve(reqwest(`./medals/countries/countryMedals-${countryCode}.html`))
        p.then(country => countryContainer.innerHTML = country)
    }

    countryContainer.classList.remove('is-hidden')
    recentContainer.classList.add('is-hidden')

})

rButton.addEventListener('click', e => {

    let dates = $$('.om-section-date')

    let p = daysCached ? Promise.resolve(daysCached) : Promise.resolve(reqwest('https://s3.amazonaws.com/gdn-cdn/olympics-2016/schedule.json'))
        p.then( days => {
            daysCached = days
            let ind = days.indexOf(dates[dates.length-1].getAttribute('data-date'))
            console.log(days)
            let nextDate = days[ind-1]

            if(ind === 0) rButton.classList.add('is-hidden');

            return Promise.resolve(reqwest(`./medals/days/dayMedals-${nextDate}.html`))
        }).then( resp => {
            rButton.insertAdjacentHTML('beforeBegin', resp)
            filterEls()
            addResultHandlers()

        }).catch( err => console.log(err))
})

addResultHandlers()