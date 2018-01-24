const fs = require('fs-extra')
const inq = require('inquirer')
const chk = require('chalk')

const { log } = require('./index')

exports.addTag = async () => {
  try {
    const tagName = await inq.prompt({
      type: 'input',
      message: `Tag name ${chk.gray('(leave blank when done)')}:`,
      name: 'value',
    })

    if (!tagName.value) return false

    const tagValue = await inq.prompt({
      type: 'input',
      message: `Tag value for ${chk.cyan(tagName.value)}:`,
      name: 'value',
    })

    return { Key: tagName.value, Value: tagValue.value }
  } catch (error) {
    throw error
  }
}

exports.addTags = async (tags = [], done) => {
  if (!done) {
    try {
      const tag = await this.addTag()

      if (tag) {
        tags.push(tag)

        await this.addTags(tags, false)
      }
    } catch (error) {
      throw error
    }
  }
  return tags
}

exports.addIamRole = async (defaultVal) => {
  try {
    const role = await inq.prompt({
      type: 'input',
      message: 'ARN of IAM Role to use:',
      name: 'arn',
      default: defaultVal,
    })

    return role.arn ? role.arn : false
  } catch (error) {
    throw error
  }
}

exports.createSNSTopic = async (region, aws) => {
  try {
    const topic = await inq.prompt([
      {
        type: 'input',
        message: 'Name of SNS Topic:',
        name: 'name',
        validate: i => (i ? true : 'name required!'),
      },
      {
        type: 'list',
        message: 'Type of Subscription for the topic:',
        choices: [
          'http',
          'https',
          'email',
          'email-json',
          'sms',
          'sqs',
          'application',
          'lambda',
        ],
        name: 'protocol',
      },
      {
        type: 'input',
        message: 'Endpoint for the subscription:',
        name: 'endpoint', // not required, since Subscribe doesn't require it.
      },
    ])

    const sns = new aws.SNS({ region })
    log.p()
    log.i('creating SNS Topic...\n')
    const { TopicArn } = await sns.createTopic({ Name: topic.name }).promise()
    await sns.subscribe({ TopicArn, Protocol: topic.protocol, Endpoint: topic.endpoint }).promise()

    return { TopicArn }
  } catch (error) {
    throw error
  }
}

exports.setStackSNS = async (region, aws, prev) => {
  try {
    let sns = await inq.prompt({
      type: 'list',
      message: 'How would you like to set up SNS for the stack?',
      default: 'existing',
      name: 'type',
      choices: [
        { name: 'Use existing SNS topic ARN', value: 'existing' },
        { name: 'Create new SNS topic', value: 'new' },
      ],
    })

    if (sns.type === 'new') {
      sns = await this.createSNSTopic(region, aws)
    } else {
      sns = await inq.prompt({
        type: 'input',
        message: 'ARN of SNS topic:',
        name: 'TopicArn',
        default: prev,
      })
    }

    return sns.TopicArn
  } catch (error) {
    throw error
  }
}

exports.selectAdvancedStackOptions = async (region, aws, prevOpts = {}, isUpdate) => {
  const options = {}

  try {
    let sns = await inq.prompt({
      type: 'confirm',
      message: 'Set up an SNS notifications for this stack?',
      default: false,
      name: 'add',
    })

    if (sns) {
      sns = await this.setStackSNS(region, aws, prevOpts.snsTopicArn)

      if (sns) options.snsTopicArn = sns
    }

    if (isUpdate) {
      const { terminationProtection, timeout, onFailure } = prevOpts

      options.terminationProtection = terminationProtection
      options.timeout = timeout
      options.onFailure = onFailure

      return options
    }

    const termination = await inq.prompt({
      type: 'confirm',
      message: 'Enable termination protection?',
      default: false,
      name: 'enable',
    })

    if (termination.enable) options.terminationProtection = true

    const timeout = await inq.prompt({
      type: 'input',
      message: `Set timeout in minutes before stack creation fails ${chk.gray('leave blank for none')}:`,
      name: 'minutes',
      validate: (i) => {
        if (i) {
          if (!/^([+-]?[1-9]\d*|0)$/.test(i)) return 'Value must be an integer'
        }
        return true
      },
    })

    if (timeout.minutes) options.timeout = parseInt(timeout.minutes, 10)

    const onFailure = await inq.prompt({
      type: 'list',
      message: 'Select an action to take on stack creation failure:',
      choices: [
        { name: 'nothing', value: 'DO_NOTHING' },
        { name: 'rollback', value: 'ROLLBACK' },
        { name: 'delete', value: 'DELETE' },
      ],
      name: 'action',
    })

    options.onFailure = onFailure.action
  } catch (error) {
    throw error
  }

  return options
}

exports.selectStackOptions = async (region, aws, prevOpts = {}, isUpdate) => {
  const options = {}

  // console.log(prevOpts)

  try {
    let tags
    let iamRole
    let advanced
    let capabilityIam

    // Use or Reuse Tags
    if (prevOpts.tags) {
      log.p(this.displayTags(prevOpts.tags))
      log.i('Previous tags found.\n')

      const reuse = await inq.prompt({
        type: 'confirm',
        message: 'Would you like to use these tags?',
        default: true,
        name: 'tags',
      })

      tags = reuse.tags && prevOpts.tags
    }

    if (!tags) {
      tags = await inq.prompt({
        type: 'confirm',
        message: 'Would you like to add tags to this stack?',
        default: false,
        name: 'add',
      })

      tags = tags.add && await this.addTags()
    }

    if (tags && tags.length) options.tags = tags

    log.p()

    // Use or Reuse IAM Role
    if (prevOpts.iamRole) {
      log.p(this.displayIamRole(prevOpts.iamRole))
      log.i('Previous IAM Role settings found.\n')

      const reuse = await inq.prompt({
        type: 'confirm',
        message: 'Would you like to use this IAM Role?',
        default: true,
        name: 'iamRole',
      })

      iamRole = reuse.iamRole && prevOpts.iamRole
    }

    if (!iamRole) {
      iamRole = await inq.prompt({
        type: 'confirm',
        message: 'Would you like to use a separate IAM role to create / update this stack?',
        default: false,
        name: 'add',
      })

      iamRole = iamRole.add && await this.addIamRole(prevOpts.iamRole)
    }

    if (iamRole) options.iamRole = iamRole

    log.p()

    // Use and Reuse Advanced Settings

    if (prevOpts.advanced) {
      log.p(this.displayAdvanced(prevOpts.advanced))
      log.i('Previous Advanced settings found.\n')

      const reuse = await inq.prompt({
        type: 'confirm',
        message: 'Would you like to use the above advanced settings?',
        default: true,
        name: 'advanced',
      })

      advanced = reuse.advanced && prevOpts.advanced
    }

    if (!advanced) {
      advanced = await inq.prompt({
        type: 'confirm',
        message: 'Would you like to configure advanced options for your stack? i.e. notifications',
        default: false,
        name: 'add',
      })

      advanced = advanced.add && await this.selectAdvancedStackOptions(region, aws, prevOpts.advanced, isUpdate)
    }

    if (advanced) options.advanced = { ...advanced }

    log.p()

    if (prevOpts.capabilityIam) {
      log.p(this.displayIamCapability(prevOpts.capabilityIam))
      log.i('Previous IAM Capability settings found.\n')

      const reuse = await inq.prompt({
        type: 'confirm',
        message: 'Would you like to use this IAM Capability?',
        default: true,
        name: 'capability',
      })

      capabilityIam = reuse.capability && prevOpts.advanced
    }

    if (!capabilityIam) {
      capabilityIam = await inq.prompt({
        type: 'confirm',
        message: 'Allow stack to create IAM resources?',
        default: true,
        name: 'add',
      })

      capabilityIam = capabilityIam.add
    }

    if (capabilityIam) options.capabilityIam = true
  } catch (error) {
    throw error
  }

  return options
}

exports.selectStackName = async (templateName, stackFile) => {
  const choices = Object.keys(stackFile)
  const stackInq = await inq.prompt([
    {
      type: 'list',
      name: 'name',
      message: `Which stack, using template ${chk.cyan(templateName)}, would you like to update?`,
      choices,
    },
  ])

  return stackInq && stackInq.name
}

exports.displayTags = (tags) => {
  const tagsDisplay = tags && tags.reduce((s, t) => {
    s += `${t.Key}, ${t.Value}\n`
    return s
  }, '')

  const tagsInfo = `${chk.green('Tags (Name, Value)')}
------------------------
${tagsDisplay}`

  return tagsInfo
}

exports.displayIamRole = (iamRole) => {
  const role = iamRole || 'Profile IAM Permissions'
  const optionsInfo = `${chk.green('IAM Role')}
------------------------
IamRole: ${role}
`
  return optionsInfo
}

exports.displayIamCapability = (iam) => {
  const capabilityIam = iam ? 'true' : 'false'
  const optionsInfo = `${chk.green('IAM Capabilties')}
------------------------
Create IAM Resources: ${capabilityIam}
`
  return optionsInfo
}

exports.displayAdvanced = (advanced) => {
  const {
    snsTopicArn,
    terminationProtection,
    timeout,
    onFailure,
  } = advanced || {}

  let advancedInfo = `${chk.green('Advanced')}
------------------------
`
  if (snsTopicArn) advancedInfo += `SNS Notification Topic ARN: ${snsTopicArn}\n`
  if (terminationProtection) advancedInfo += `Termination Protection Enabled: ${terminationProtection}\n`
  if (timeout) advancedInfo += `Timeout in Minutes: ${timeout}\n`
  if (onFailure) advancedInfo += `On Failure Behavior: ${onFailure}\n`

  return advancedInfo
}

exports.reviewStackInfo = (name, stack, message, action) => {
  const {
    profile,
    region,
    options,
    parameters,
  } = stack
  const opts = options || {}
  const info = []

  // TODO: Account for no parameters && missing parameters

  // Add General info
  const generalInfo = `
${chk.green('General')}
------------------------
Stack Name: ${name}
Profile: ${profile.name}
Region: ${region}
`
  info.push(generalInfo)

  // Add Stack Option Info
  info.push(this.displayIamRole(opts.iamRole))
  info.push(this.displayIamCapability(opts.capabilityIam))

  // Add Tags Info
  if (opts.tags) {
    info.push(this.displayTags(opts.tags))
  }

  // Add Advanced Settings Info
  if (opts.advanced && Object.keys(opts.advanced).length) {
    info.push(this.displayAdvanced(opts.advanced))
  }

  // Add Parameter Info
  const pKeys = Object.keys(parameters)
  const params = pKeys.reduce((s, key) => {
    s += `${key} = ${parameters[key]}\n`
    return s
  }, '')
  const paramInfo = `${chk.green('Parameters')}
------------------------
${params}`
  info.push(paramInfo)

  log.p(info.join('\n'))

  if (message) log.p(`${chk.green(message)} ${chk.gray('(scroll up to see all)')}\n`)
  if (action === 'Update') {
    log.i('Termination Protection, Timeout in Minutes, and On Failure Behavior can only be set on creation of stacks.')
    log.i('Stack Name, Profile, and Region cannot be changed on a stack once deployed.\n')
  }
}

exports.confirmStack = async (templateName, name, stack, message, action) => {
  try {
    this.reviewStackInfo(name, stack, message, action)
    // TODO: if update, we need to tell them that some parameters cannot be updated once a stack is deployed

    const use = await inq.prompt({
      type: 'confirm',
      message: `${action} Stack ${chk.cyan(name)} with the above options?`,
      name: 'stack',
      default: true,
    })

    return use.stack
  } catch (error) {
    throw error
  }
}

exports.createStack = async (template, name, stack, aws) => {
  const { region, options, parameters } = stack
  const cfn = new aws.CloudFormation({ region })
  const opts = { StackName: name, TemplateBody: JSON.stringify(template) }

  if (parameters) {
    opts.Parameters = Object.keys(parameters).map(k => ({ ParameterKey: k, ParameterValue: parameters[k].toString() }))
  }

  if (options) {
    const { tags, iamRole, advanced, capabilityIam } = options

    if (tags) opts.Tags = tags
    if (iamRole) opts.RoleArn = iamRole
    if (capabilityIam) opts.Capabilities = ['CAPABILITY_NAMED_IAM']

    if (advanced) {
      const { snsTopicArn, terminationProtection, timeout, onFailure } = advanced

      if (snsTopicArn) opts.NotificationARNs = [snsTopicArn]
      if (onFailure) opts.OnFailure = onFailure
      if (terminationProtection !== undefined) opts.EnableTerminationProtection = terminationProtection
      if (timeout) opts.TimeoutInMinutes = timeout
    }
  }

  try {
    const { StackId } = await cfn.createStack(opts).promise()

    return StackId
  } catch (error) {
    throw error
  }
}

exports.updateStack = async (template, name, stack, aws) => {
  const { region, options, parameters } = stack
  const cfn = new aws.CloudFormation({ region })
  const opts = { StackName: name, TemplateBody: JSON.stringify(template) }

  if (parameters) {
    opts.Parameters = Object.keys(parameters).map(k => ({ ParameterKey: k, ParameterValue: parameters[k].toString() }))
  }

  if (options) {
    const { tags, iamRole, advanced, capabilityIam } = options

    if (tags) opts.Tags = tags
    if (iamRole) opts.RoleArn = iamRole
    if (capabilityIam) opts.Capabilities = ['CAPABILITY_NAMED_IAM']

    if (advanced) {
      const { snsTopicArn } = advanced

      if (snsTopicArn) opts.NotificationARNs = [snsTopicArn]
    }
  }

  const { StackId } = await cfn.updateStack(opts).promise()

  return StackId
}