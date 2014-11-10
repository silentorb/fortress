/**
 * User: Chris Johnson
 * Date: 11/9/2014
 */

/// <reference path="references.ts"/>

interface ICondition {
  get_path():string
  actions:string[]
  is_possible_gate(gate:Gate):boolean
  wall_message:(action:string)=>string
}

class Property_Condition implements ICondition {
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

class Trellis_Condition implements ICondition {
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

class Access_Test {
  //prerequisites:Prerequisite[]
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

//class Prerequisite {
//
//}

class Wall {
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

class Result {
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
