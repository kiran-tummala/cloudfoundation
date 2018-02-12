const fs = require('fs-extra')
const glob = require('glob')
const chk = require('chalk')

const ut = require('../utils')

exports.buildTemplate = function buildTemplate (name) {
  const cwd = process.cwd()
  const templateObject = ut.getTemplateAsObject(name)
  const dist = `${cwd}/dist`

  fs.ensureDirSync(dist)

  const full = JSON.stringify(templateObject, null, '  ')
  const min = JSON.stringify(templateObject)

  fs.writeFileSync(`${dist}/${name}.json`, full, 'utf8')
  fs.writeFileSync(`${dist}/${name}.min.json`, min, 'utf8')
}

exports.build = async function buildOne (env) {
  let name = env

  if (!name) {
    name = await ut.inquireTemplateName('Which template would you like to build?')
  }

  ut.log.i(`Building template ${chk.cyan(name)}...`)

  exports.buildTemplate(name)

  return ut.log.s(`Template ${chk.cyan(`${name}.json`)} and ${chk.cyan(`${name}.min.json`)} built in ${chk.cyan('./dist')}!`, 2)
}

exports.buildAll = async function buildAll () {
  const cwd = process.cwd()
  ut.log.i('Building all templates...')

  const names = glob.sync(`${cwd}/src/*`).map((s) => {
    const p = s.split('/')
    return p[p.length - 1]
  })

  names.forEach(n => exports.buildTemplate(n))

  ut.log.s('The following templates were successfully built:', 2)

  names.forEach(n => ut.log.m(`${chk.cyan(`${n}.json`)} and ${chk.cyan(`${n}.min.json`)}`))

  return ut.log.i(`Find the built templates in ${chk.cyan('./dist')}`, 2)
}

