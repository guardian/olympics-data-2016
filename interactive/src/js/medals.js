import { $, $$ } from './lib/selector'
import reqwest from 'reqwest'

import './schedule'

let lbButton = $('.js-leaderboard-button')
let rButton = $('.js-recent-button')
let countries = $$('.om-table-row')

let countryCache = {}

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

function changeCountry() {

    let cc = cSelect.options[cSelect.selectedIndex].value
    console.log(cc)
    let p = countryCache[cc] ? Promise.resolve(countryCache[cc]) : Promise.resolve(reqwest(`./medals/countries/countryMedals-${cc}.html`))
    
    p.then(country => {

        countryCache[cc] = country
        countryContainer.innerHTML = country

        let favouriteTable = $('.om-table--favourite')
        let row = $(`.om-table-row[data-id="${cc}"]`).cloneNode(true)
        row.classList.remove('om-table-row--hidden')
        favouriteTable.innerHTML = row.outerHTML

        let cmButton = $('.js-country-medals-button')
        if(cmButton){
            console.log(cmButton)
            cmButton.addEventListener('click', e => {
                let medals = $$('.om-country-medal-entry')
                medals.slice(3).forEach(m => m.classList.toggle('is-hidden'))
                cmButton.innerHTML = (cmButton.innerHTML === 'All medals') ? 'Fewer medals' : 'All medals'
            })
        }
    })
}

cSelect.addEventListener('change', () => {
    changeCountry()
})

// select GBR by default
cSelect.selectedIndex = Array.from(cSelect.options).find(o => o.value === 'GBR').index
changeCountry()
