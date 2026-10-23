//! WebAssembly bindings. Documents cross the boundary as plain JS objects;
//! the compiled grid and layout use typed arrays.

use js_sys::{Float64Array, Object, Reflect, Uint16Array, Uint32Array, Uint8Array};
use serde::Serialize;
use serde_json::Value;
use wasm_bindgen::prelude::*;

fn to_js<T: Serialize + ?Sized>(value: &T) -> JsValue {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .unwrap_or(JsValue::NULL)
}

fn from_js(value: JsValue) -> Value {
    serde_wasm_bindgen::from_value(value).unwrap_or(Value::Null)
}

fn set(obj: &Object, key: &str, value: &JsValue) {
    // Setting a property on a fresh plain object cannot fail.
    let _ = Reflect::set(obj, &JsValue::from_str(key), value);
}

/// `{ doc, issues, readOnly }`
#[wasm_bindgen]
pub fn parse(text: &str) -> JsValue {
    let parsed = crate::parse(text);
    let obj = Object::new();
    set(&obj, "doc", &parsed.doc.as_ref().map_or(JsValue::NULL, to_js));
    set(&obj, "issues", &to_js(&parsed.issues));
    set(&obj, "readOnly", &JsValue::from_bool(parsed.read_only));
    obj.into()
}

#[wasm_bindgen]
pub fn serialize(doc: JsValue) -> Result<String, JsError> {
    crate::serialize(&from_js(doc)).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen]
pub fn validate(doc: JsValue) -> JsValue {
    to_js(&crate::validate(&from_js(doc)))
}

#[wasm_bindgen]
pub fn compile(doc: JsValue) -> JsValue {
    let Some(chart) = crate::compile(&from_js(doc)) else {
        return JsValue::NULL;
    };
    let obj = Object::new();
    set(&obj, "width", &JsValue::from(chart.width as u32));
    set(&obj, "height", &JsValue::from(chart.height as u32));
    set(&obj, "palette", &to_js(&chart.palette));
    set(&obj, "cells", &Uint16Array::from(&chart.cells[..]).into());
    set(&obj, "symbols", &Uint8Array::from(&chart.symbols[..]).into());
    set(&obj, "rowBand", &Uint16Array::from(&chart.row_band[..]).into());
    obj.into()
}

#[wasm_bindgen]
pub fn layout(doc: JsValue) -> JsValue {
    let Some(layout) = crate::layout(&from_js(doc)) else {
        return JsValue::NULL;
    };
    let obj = Object::new();
    set(&obj, "stitchWidth", &JsValue::from(layout.stitch_width));
    set(&obj, "rowHeight", &JsValue::from(layout.row_height));
    set(&obj, "rowY", &Float64Array::from(&layout.row_y[..]).into());
    set(&obj, "rowStart", &Uint32Array::from(&layout.row_start[..]).into());
    set(&obj, "x", &Float64Array::from(&layout.x[..]).into());
    obj.into()
}

#[wasm_bindgen]
pub fn suggest_cast_on(doc: JsValue) -> Vec<u32> {
    crate::suggest_cast_on(&from_js(doc))
}
