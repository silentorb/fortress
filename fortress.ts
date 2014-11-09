/// <reference path="../vineyard/vineyard.d.ts"/>

import fs = require('fs')
import when = require('when')
import Vineyard = require('vineyard')
import MetaHub = require('vineyard-metahub')
import Ground = require('vineyard-ground')

class Fortress extends Vineyard.Bulb {
  core:Fortress.Core

  grow() {
    this.core = new Fortress.Core(this.config, this.ground)
  }

  query_access(user:Vineyard.IUser, query:Ground.Query_Builder):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    if (!user.roles)
      throw new Error('User passed to update_access is missing a roles array.')

    var test = this.core.prepare_query_test(query)

    return this.core.run(user, test)
    //return when.resolve(result)
  }

  update_access(user:Vineyard.IUser, updates):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    if (!user.roles)
      throw new Error('User passed to update_access is missing a roles array.')

    if (!MetaHub.is_array(updates))
      updates = [updates]

    return when.resolve(new Fortress.Result())
  }

  user_has_role(user, role_name:string):boolean {
    for (var i in user.roles) {
      if (user.roles[i].name == role_name)
        return true
    }
    return false
  }
}

module Fortress {

  interface Fortress_Source {
    zones:Zone_Source[]
  }

  export interface Gate_Source {
    type:string
    roles:string[]
    actions:string[]
    resources:any
  }

  export interface Zone_Source {
    roles:string[]
    gates:Gate_Source[]
  }

  export interface Zone {
    roles:string[]
    gates:Gate[]
  }

//  export interface Resource {
//    trellis:Ground.Trellis
//    properties:Ground.Property[]
//  }

  export class Core {
    gate_types = {}
    zones:Zone[] = []
    log:boolean = false
    ground:Ground.Core

    constructor(bulb_config, ground:Ground.Core) {
      this.ground = ground
      this.gate_types['global'] = Global
      this.gate_types['user_content'] = User_Content
      this.gate_types['path'] = Link
      var json = fs.readFileSync(bulb_config.config_path, 'ascii')
      var config:Fortress_Source = JSON.parse(json.toString())

      for (var i = 0; i < config.zones.length; ++i) {
        this.add_zone(config.zones[i])
      }
    }

    add_zone(source:Zone_Source) {
      var zone = {
        roles: source.roles,
        gates: []
      }
      this.zones.push(zone)
      for (var i = 0; i < source.gates.length; ++i) {
        this.add_gate(zone, source.gates[i])
      }
    }

    add_gate(zone:Zone, source:Gate_Source) {
      var type = this.gate_types[source.type]
      if (!type)
        throw new Error('Could not find gate: "' + source.type + '".')

      var gate = new type(this, source)
      zone.gates.push(gate)
    }

    get_roles(user):Promise {
      return this.ground.trellises['user'].assure_properties(user, ['id', 'name', 'roles'])
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

    prepare_query_test(query:Ground.Query_Builder):Access_Test {
      var test = new Access_Test()
      var condition = test.add_trellis(query.trellis, ['query'])
      if (query.filters) {
        for (var i = 0; i < query.filters.length; ++i) {
          var filter = query.filters[i]
          var property = query.trellis.properties[filter.path]
          if (property.parent.name == query.trellis.name) {
            condition.add_property(property, ['query'])
          }
        }
      }
      if (query.properties) {
        for (var name in query.properties) {
          var property = query.trellis.properties[name]
          condition.add_property(property, ['query'])
        }
      }


      test.fill_implicit()
      return test
    }

    prepare_update_test(user:Vineyard.IUser, query:Ground.Query_Builder):Access_Test {
      return null
    }

    run(user:Vineyard.IUser, test:Access_Test):Promise {
      //console.log(test.trellises)
      var user_gates = this.get_user_gates(user)
      var result = new Result()
//      console.log('gates', user_gates)

      for (var i in test.trellises) {
        var trellis_test = test.trellises[i]
        var trellis_gates = user_gates.filter((gate)=> trellis_test.is_possible_gate(gate))
        if (trellis_gates.length == 0 || !this.check_trellis(user, trellis_test, trellis_gates)) {
          result.walls.push(new Wall(trellis_test))
          break
        }

        for (var j in trellis_test.properties) {
          var condition = trellis_test.properties[j]
          if (condition.is_implicit && result.is_blacklisted(condition))
            continue

          var property_gates = trellis_gates.filter((gate)=> condition.is_possible_gate(gate))
          if (property_gates.length == 0 || !this.check_property(user, condition, property_gates)) {
            if (condition.is_implicit) {
              if (condition.property.name != condition.property.parent.primary_key)
                result.blacklist_implicit_property(condition)
            }
            else {
              result.walls.push(new Wall(condition))
              break
            }
          }
        }
      }

      //console.log(result)
      return this.post_process_result(result)
    }

    post_process_result(result:Result):Promise {
      if (result.post_actions.length == 0 || result.walls.length > 0)
        return when.resolve(result.finalize())

      var promises = result.post_actions.concat(()=> result.finalize())
      var pipeline = require('when/pipeline')
      return pipeline(promises)
    }



    check_trellis(user:Vineyard.IUser, trellis:Trellis_Condition, gates:Gate[]) {
      for (var j in gates) {
        var gate = gates[j]
        if (gate.check(user, trellis))
          return true
      }
      return false
    }

    check_property(user:Vineyard.IUser, property:Property_Condition, gates:Gate[]) {
      for (var j in gates) {
        var gate = gates[j]
        if (gate.check(user, property))
          return true
      }
      return false
    }

    get_user_gates(user:Vineyard.IUser):Gate[] {
      var result = []
      for (var i = 0; i < this.zones.length; ++i) {
        var zone = this.zones[i]
        if (this.user_has_any_role(user, zone.roles))
          result = result.concat(zone.gates)
      }
      return result
    }

    static find_filter(query:Ground.Query_Builder, path:string):Ground.Query_Filter {
      if (!query.filters)
        return null

      for (var i = 0; i < query.filters.length; ++i) {
        var filter = query.filters[i]
        if (filter.path == path)
          return filter
      }

      return null
    }

  }

  export class Gate extends MetaHub.Meta_Object {
    fortress:Fortress
//    on:string[]
    resources:any
    actions:string[]
    name:string

    constructor(fortress:Fortress, source:Gate_Source) {
      super()
      this.fortress = fortress
      this.name = source.type
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
    is_possible_gate(gate:Gate):boolean
    wall_message:(action:string)=>string
  }

  export class Property_Condition implements ICondition {
    property:Ground.Property
    actions:string[]
    // If the query did not specify any properties, all properties are added implicitly
    // and will be silently removed if inaccessible
    is_implicit:boolean

    constructor(property:Ground.Property, actions:string[], is_implicit:boolean = false) {
      this.property = property
      this.actions = actions
      this.is_implicit = is_implicit
    }

    get_path():string {
      return this.property.fullname()
    }

    is_possible_gate(gate:Gate):boolean {
      var resource = gate.resources[this.property.parent.name]
      return resource != undefined
      && (resource[0] == '*' || resource.indexOf(this.property.name) !== -1)
    }

    wall_message(action) {
      return 'You do not have permission to ' + action + ' property "' + this.property.fullname() + '".'
    }
  }

  export class Trellis_Condition implements ICondition {
    trellis:Ground.Trellis
    actions:string[] = []
    properties:{ [key: string]: Property_Condition
    } = {}

    constructor(trellis:Ground.Trellis) {
      this.trellis = trellis
    }

    add_property(property:Ground.Property, actions:string[]) {
      var primary_keys = this.trellis.get_primary_keys()
      for (var i = 0; i < primary_keys.length; ++i) {
        if (primary_keys[i].name == property.name)
          return
      }

      this.properties[property.name] = new Property_Condition(property, actions)
    }

    fill_implicit() {
      if (!this.properties) {
        var primary_keys = this.trellis.get_primary_keys().map((p)=> p.name)
        var properties = MetaHub.filter(this.trellis.get_all_properties(),
          (p)=> primary_keys.indexOf(p.name) == -1)

        this.properties = <{ [key: string]: Property_Condition
        }> MetaHub.map(properties, (p)=> new Property_Condition(p, this.actions, true))
      }
    }

    get_path():string {
      return this.trellis.name
    }

    is_possible_gate(gate:Gate):boolean {
      return gate.resources[this.trellis.name] != undefined
    }

    wall_message(action) {
      return 'You do not have permission to ' + action + ' trellis "' + this.trellis.name + '".'
    }
  }

  export class Access_Test {
    prerequisites:Prerequisite[]
    trellises:{ [key: string]: Trellis_Condition
    } = {}

    add_trellis(trellis:Ground.Trellis, actions:string[]):Trellis_Condition {
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

      return entry
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

    check(user:Vineyard.IUser, resource, info = null):boolean {
      return true
    }
  }

  export class Wall {
    actions:string[]
    path:string
    condition:ICondition

    constructor(condition:ICondition) {
      this.actions = (<string[]>[]).concat(condition.actions)
      this.path = condition.get_path()
      this.condition = condition
    }

    get_path():string {
      return this.path
    }

    get_message():string {
      return this.condition.wall_message(this.actions[0])
    }
  }

  export class Result {
    walls:Wall[] = []
    blacklisted_trellis_properties = {}
    is_allowed:boolean = false
    additional_filters:Ground.Query_Filter[] = []
    post_actions:any[] = []

    blacklist_implicit_property(condition:Property_Condition) {
      var name = condition.property.parent.name
      var trellis = this.blacklisted_trellis_properties[name] = this.blacklisted_trellis_properties[name] || []
      trellis.push(condition.property.name)
    }

    is_blacklisted(condition:Property_Condition):boolean {
      var name = condition.property.parent.name
      var trellis_entry = this.blacklisted_trellis_properties[name]
      return trellis_entry && trellis_entry.indexOf(condition.property.name) > -1
    }

    get_message():string {
      return "You are not authorized to perform this request for the following reasons:\n"
      + this.walls.map((wall)=> wall.get_message()).join("\n")
    }

    finalize():Result {
      this.is_allowed = this.walls.length == 0
      return this
    }
  }

}
export = Fortress
