/// <reference path="../vineyard/vineyard.d.ts"/>

import fs = require('fs')
import when = require('when')
import Vineyard = require('vineyard')
import MetaHub = require('vineyard-metahub')
import Ground = require('vineyard-ground')

class Fortress extends Vineyard.Bulb {
  gate_types = {}
  gates:Fortress.Gate[] = []
  log:boolean = false

  add_gate(source:Fortress.Gate_Source) {
    var type = this.gate_types[source.type]
    if (!type)
      throw new Error('Could not find gate: "' + source.type + '".')

    var gate = new type(this, source)
    this.gates.push(gate)
  }

  get_roles(user):Promise {
    return this.ground.trellises['user'].assure_properties(user, [ 'id', 'name', 'roles' ])
  }

  user_has_role(user, role_name:string):boolean {
    for (var i in user.roles) {
      if (user.roles[i].name == role_name)
        return true
    }
    return false
  }

  user_has_any_role(user, role_names:string[]):boolean {
    for (var a in user.roles) {
      for (var b in role_names) {
        if (user.roles[a].name == role_names[b])
          return true
      }
    }
    return false
  }

  grow() {
    this.gate_types['global'] = Fortress.Global
    this.gate_types['user_content'] = Fortress.User_Content
    this.gate_types['link'] = Fortress.Link
    var json = fs.readFileSync(this.config.config_path, 'ascii')
    var config = JSON.parse(json.toString())

    for (var i = 0; i < config.gates.length; ++i) {
      this.add_gate(config.gates[i])
    }
  }

  prepare_query_test(query:Ground.Query_Builder):Fortress.Access_Test {
    var test = new Fortress.Access_Test()
    test.add_trellis(query.trellis, [ 'query' ])

    test.fill_implicit()
    return test
  }

  prepare_update_test(user:Vineyard.IUser, query:Ground.Query_Builder):Fortress.Access_Test {
    return null
  }

  query_access(user:Vineyard.IUser, query:Ground.Query_Builder):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    if (!user.roles)
      throw new Error('User passed to update_access is missing a roles array.')

    var test = this.prepare_query_test(query)

    var result = this.run(test)
    return when.resolve(result)
  }

  update_access(user:Vineyard.IUser, updates):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    if (!user.roles)
      throw new Error('User passed to update_access is missing a roles array.')

    if (!MetaHub.is_array(updates))
      updates = [ updates ]

    return when.resolve(new Fortress.Result())
  }

  run(test:Fortress.Access_Test):Fortress.Result {
    var result = new Fortress.Result()

    return result
  }
}

module Fortress {

  export interface Gate_Source {
    type:string
    roles:string[]
    actions:string[]
    resources:any[]
  }

  export class Resource {
    trellis:Ground.Trellis
    properties:Ground.Property[]
  }

  export class Gate extends MetaHub.Meta_Object {
    fortress:Fortress
    roles:string[]
//    on:string[]
    resources:Resource[] // null / undefined means all resources ( Trellis.* )
    actions:string[] // null / undefined means all actions ( Trellis.* )
    name:string

    constructor(fortress:Fortress, source:Gate_Source) {
      super()
      if (!source.roles || source.roles.length == 0)
        throw new Error('Each gate requires at least one role.')

      this.fortress = fortress
      this.name = source.type
      this.roles = source.roles
      this.actions = source.actions
      this.resources = source.resources
    }

    check(user:Vineyard.IUser, resource, info = null):boolean {
      return false
    }
  }

  export class Global extends Gate {
    check(user:Vineyard.IUser, resource, info = null):boolean {
      return true
    }
  }

  export interface ICondition {
    get_path():string
    actions:string[]
  }

  export class Property_Condition implements ICondition {
    property:Ground.Property
    actions:string[]
    // If the query did not specify any properties, all properties are added implicitly
    // and will be silently removed if inaccessible
    implicit:boolean = false

    constructor(property:Ground.Property, actions:string[]) {
      this.property = property
      this.actions = actions
    }

    get_path():string {
      return this.property.fullname()
    }
  }

  export class Trellis_Condition implements ICondition {
    trellis:Ground.Trellis
    actions:string[] = []
    properties:{ [key: string]: Property_Condition
    }

    constructor(trellis:Ground.Trellis) {
      this.trellis = trellis
    }

    fill_implicit() {
      if (!this.properties) {
        var properties = this.trellis.get_all_properties()
        this.properties = <{ [key: string]: Property_Condition
        }> MetaHub.map(properties, (p)=> new Property_Condition(p, this.actions))
      }
    }

    get_path():string {
      return this.trellis.name
    }
  }

  export class Access_Test {
    prerequisites:Prerequisite[]
    trellises:{ [key: string]: Trellis_Condition
    } = {}

    add_trellis(trellis:Ground.Trellis, actions:string[]) {
      if (!this.trellises[trellis.name]) {
        this.trellises[trellis.name] = new Trellis_Condition(trellis)
      }
      var entry = this.trellises[trellis.name]

      // Add any actions the trellis condition doesn't already have
      for (var i in actions) {
        var action = actions[i]
        if (entry.actions.indexOf(action) === -1)
          entry.actions.push(action)
      }
    }

    fill_implicit() {
      for (var i in this.trellises) {
        this.trellises[i].fill_implicit()
      }
    }
  }

  export class Prerequisite {

  }

  export class User_Content extends Gate {

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

//    check(user:Vineyard.IUser, resource, info = null):Promise {
//      if (resource.type == 'query') {
//        if (this.limited_to_user(resource, user))
//          return when.resolve(true)
//
//        if (User_Content.is_open_query(resource))
//          return when.resolve(true)
//
//        return resource.run()
//          .then((rows)=> this.check_rows_ownership(user, rows))
//      }
//      else {
//        var id = resource.seed[resource.trellis.primary_key]
//
//        if (!id) // No id means this must be a creation.  This case will always allow access.
//          return when.resolve(true)
//
//        var query = this.fortress.ground.create_query(resource.trellis.name)
//        query.add_key_filter(id)
//        var runner = query.create_runner()
//        return runner.run_core()
//          // No rows should result in 'true' because that means this is a creation,
//          // and the new creation will definitely be owned by the current user
//          .then((rows)=> rows.length == 0 || this.check_rows_ownership(user, rows))
//      }
//    }

    limited_to_user(query:Ground.Query_Builder, user:Vineyard.IUser):boolean {
      var filters = query.filters.filter((filter)=> filter.path == 'user')
      if (filters.length !== 1)
        return false

      return filters[0].value == user.id
    }
  }

  export class Link extends Gate {
    paths:string[]

    constructor(fortress:Fortress, source) {
      super(fortress, source)
      this.paths = source.paths.map(Ground.path_to_array)
    }

    check_path(path:string, user:Vineyard.IUser, resource):Promise {
      var args, id = resource.get_primary_key_value()

      // This whole gate is only meant for specific queries, not general ones.
      if (id === undefined)
        return when.resolve(false)

      if (path[0] == 'user')
        args = [user.id, id]
      else
        args = [id, user.id]

      return Ground.Query.query_path(path, args, this.fortress.ground)
    }

    check(user:Vineyard.IUser, resource, info = null):Promise {
//      return Fortress.sequential_check(
//        this.paths,
//        (path)=> this.check_path(path, user, resource),
//        (result)=> result && result.total > 0
//      )
//        .then(
//        (result)=> true,
//        (result)=> false
//      )
      throw new Error('Not implemented.')
    }
  }

  export class Result_Wall implements ICondition {
    actions:string[]
    path:string

    constructor(condition:ICondition) {
      this.actions = [].concat(condition.actions)
      this.path = condition.get_path()
    }

    get_path():string {
      return this.path
    }
  }

  export class Result {
    walls:Result_Wall[] = []
  }

}
export = Fortress
require('source-map-support').install();
