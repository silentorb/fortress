/**
 * User: Chris Johnson
 * Date: 11/9/2014
 */

/// <reference path="references.ts"/>

function run(user:Vineyard.IUser, test:Access_Test, core:Core):Promise {
  //console.log(test.trellises)
  var user_gates = core.get_user_gates(user)
  var result = new Result()
//      console.log('gates', user_gates)

  for (var i in test.trellises) {
    var trellis_test = test.trellises[i]
    var trellis_gates = user_gates.filter((gate)=> trellis_test.is_possible_gate(gate))
    if (trellis_gates.length == 0 || !core.check_trellis(user, trellis_test, trellis_gates)) {
      result.walls.push(new Wall(trellis_test))
      break
    }

    for (var j in trellis_test.properties) {
      var condition = trellis_test.properties[j]
      if (condition.is_implicit && result.is_blacklisted(condition))
        continue

      var property_gates = trellis_gates.filter((gate)=> condition.is_possible_gate(gate, trellis_test))
      if (property_gates.length == 0 || !core.check_property(user, condition, property_gates)) {
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
  return core.post_process_result(result)
}

interface ICondition {
  get_path():string
  actions:string[]
  is_possible_gate(gate:Gate, context):boolean
  wall_message:(action:string)=>string
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

  is_possible_gate(gate:Gate, context = null):boolean {
    if (gate.resources === '*' || gate.resources[0] === '*')
      return true

    return gate.resources[this.trellis.name] != undefined
  }

  wall_message(action) {
    return 'You do not have permission to ' + action + " trellis '" + this.trellis.name + "'."
  }
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

  is_possible_gate(gate:Gate, context):boolean {
    if (gate.resources === '*' || gate.resources[0] === '*')
      return true

    var resource = gate.resources[this.property.parent.name]
    if (resource == undefined) {

      // Test for child trellis permission
      var trellis_test = <Trellis_Condition> context
      resource = gate.resources[trellis_test.trellis.name]
      if (resource == undefined)
        return false
    }

    return resource[0] == '*' || resource.indexOf(this.property.name) !== -1
  }

  wall_message(action) {
    return 'You do not have permission to ' + action + " property '" + this.property.fullname() + "'."
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
    return "You are not authorized to perform this request: \n"
    + this.walls.map((wall)=> wall.get_message()).join("\n")
  }

  finalize():Result {
    this.is_allowed = this.walls.length == 0
    return this
  }
}
