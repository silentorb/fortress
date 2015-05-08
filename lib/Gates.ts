/// <reference path="references.ts"/>

function this_only_exists_to_kick_typescript_to_keep_the_above_comments() {}

///***var when = require('when')
///***var Vineyard = require('vineyard')
///***var MetaHub = require('vineyard-metahub')
///***var Ground = require('vineyard-ground')

function this_only_exists_to_kick_typescript_to_keep_the_above_comments2() {}

interface Zone {
  roles:string[]
  gates:Gate[]
}

class Gate extends MetaHub.Meta_Object {
  resources:any
  actions:string[]
  name:string

  constructor(source:Gate_Source) {
    super()
    this.name = source.type
    this.actions = source.actions
    this.resources = source.resources
    if (!source.resources)
      throw new Error('Gate ' + this.name + ' is missing resources')
  }

  check(user:Vineyard.IUser, resource, info = null):boolean {
    return false
  }
}

class Global extends Gate {
  check(user:Vineyard.IUser, resource, info = null):boolean {
    return true
  }
}

class Link extends Gate {
  paths:string[]

  constructor(source) {
    super(source)
    this.paths = source.paths.map(Ground.path_to_array)
  }

  check(user:Vineyard.IUser, resource, info = null):boolean {
    return true
  }
}

class User_Content extends Gate {

  private check_rows_ownership(user, rows) {
    if (rows.length == 0)
      throw new Error('No records were found to check ownership.')
    for (var i = 0; i < rows.length; ++i) {
      var row = rows[i]
      if (row['author'] != user.id)
        return false
    }
    return true
  }

  private static is_open_query(query):boolean {
    var filters = query.filters.filter(
      (filter)=> filter.path == query.trellis.primary_key
    )
    return filters.length == 0
  }

  limited_to_user(query:mining.Query_Builder, user:Vineyard.IUser):boolean {
    var filters = query.filters.filter((filter)=> filter.path == 'user')
    if (filters.length !== 1)
      return false

    return filters[0].value == user.id
  }
}