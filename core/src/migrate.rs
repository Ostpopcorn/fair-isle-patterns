//! Format migrations. Older files are upgraded on load, one version at a
//! time, before they are read.

use serde_json::Value;

/// The newest format version this core reads and writes.
pub const CURRENT_VERSION: i64 = 1;

type Migration = fn(Value) -> Value;

/// `MIGRATIONS[i]` upgrades a document from version `i + 1` to `i + 2`.
/// Version 1 is the first version, so there is nothing to migrate yet.
const MIGRATIONS: &[Migration] = &[];

/// Upgrades `value` from `from` to [`CURRENT_VERSION`] and sets `version`.
pub fn migrate(mut value: Value, from: i64) -> Value {
    let mut version = from;
    while version < CURRENT_VERSION {
        let Some(step) = usize::try_from(version - 1).ok().and_then(|i| MIGRATIONS.get(i)) else {
            break;
        };
        value = step(value);
        version += 1;
    }
    if let Some(map) = value.as_object_mut() {
        map.insert("version".into(), version.into());
    }
    value
}
