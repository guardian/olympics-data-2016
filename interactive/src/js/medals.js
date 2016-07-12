import { $, $$ } from './lib/selector'
import reqwest from 'reqwest'

let lbButton = $('.js-leaderboard-button')
let rButton = $('.js-recent-button')
let countries = $$('.om-table-row')

function yesterday(dayStr){
    let date = new Date(dayStr)
    return (new Date(date - 24*3600*1000)).toISOString().slice(0,10)
}

function filterEls() {

    let id_ = dSelect.options[dSelect.selectedIndex].value
    let disciplines = $$('.om-recent-discipline')
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
            reqwest(`./eventunits/results-${euid}.html`).then(resp => {
                el.parentElement.innerHTML += resp;
            });
        })
    })
}


lbButton.addEventListener('click', e => {
    countries.slice(10).forEach(function(el){
        el.classList.toggle('om-table-row--hidden')
    })
    lbButton.innerHTML = (lbButton.innerHTML === 'Hide countries') ? 'All countries' : 'Hide countries'
})

let dSelect = $('.om-select-discipline')
let cSelect = $('.om-select-country')
let container = $('.om-recent-days')

dSelect.addEventListener('change', () => {
    filterEls()
})

cSelect.addEventListener('change', () => {
    let id_ = cSelect.options[cSelect.selectedIndex].value
    console.log(id_)
})

rButton.addEventListener('click', e => {

    let dates = $$('.om-section-date')

    let nextDate = yesterday(dates[dates.length-1].getAttribute('data-date'))

    reqwest(`./medals/days/dayMedals-${nextDate}.html`).then(resp => {
        container.innerHTML += resp
        filterEls()
        addResultHandlers()
    })
})

addResultHandlers()