/**
 * User: Chris Johnson
 * Date: 11/9/2014
 */

/// <reference path="references.ts"/>


class Core {
  gate_types = {}
  zones:Zone[] = []
  log:boolean = false
  ground:Ground.Core

  constructor(bulb_config, ground:Ground.Core) {
    this.ground = ground
    this.zones = Loader.load(bulb_config.config_path)
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
    var property
    var condition = test.add_trellis(query.trellis, ['query'])
    if (query.filters) {
      for (var i = 0; i < query.filters.length; ++i) {
        var filter = query.filters[i]
        var properties = query.trellis.get_all_properties()
        property = properties[filter.path]
        if (property.parent.name == query.trellis.name) {
          condition.add_property(property, ['query'])
        }
      }
    }
    if (query.properties) {
      for (var name in query.properties) {
        property = query.trellis.get_all_properties()[name]
        condition.add_property(property, ['query'])
      }
    }

    test.fill_implicit()
    return test
  }

  prepare_update_test(updates:any[]):Access_Test {
    var test = new Access_Test()
    var trellises = {}
    for (var i = 0; i < updates.length; ++i) {
      var trellis = updates[i].trellis
      if (!trellises[trellis.name])
        trellises[trellis.name] = trellis
    }

    for (var name in trellises) {
      var condition = test.add_trellis(trellises[name], ['update'])
    }
    //if (query.properties) {
    //  for (var name in query.properties) {
    //    var property = query.trellis.properties[name]
    //    condition.add_property(property, ['query'])
    //  }
    //}

    //test.fill_implicit()
    return test
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