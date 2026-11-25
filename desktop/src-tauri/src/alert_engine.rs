//! The rules behind the tray alerts, run in a small JavaScript engine (QuickJS). They're the phone-alert service's
//! own files (netlify/push/alerts.mjs and extras.mjs, built into the app), driven by tray_alerts.js for this one PC.
//! This file only carries text in and out; the network reads and the notifications are in alerts.rs.

use rquickjs::loader::{BuiltinLoader, BuiltinResolver};
use rquickjs::{Context, Function, Module, Object, Runtime};

const ALERTS: &str = include_str!("../../../netlify/push/alerts.mjs");
const EXTRAS: &str = include_str!("../../../netlify/push/extras.mjs");
const DRIVER: &str = include_str!("tray_alerts.js");

pub struct Engine {
    rt: Runtime,
    ctx: Context,
}

impl Engine {
    pub fn new() -> Result<Engine, String> {
        let err = |e: rquickjs::Error| e.to_string();
        let rt = Runtime::new().map_err(err)?;
        // a summary feed is a few hundred KB of JSON; this is far more than a pass needs and keeps a bad feed in check
        rt.set_memory_limit(96 << 20);
        rt.set_loader(
            BuiltinResolver::default().with_module("alerts.mjs").with_module("extras.mjs"),
            BuiltinLoader::default().with_module("alerts.mjs", ALERTS).with_module("extras.mjs", EXTRAS),
        );
        let ctx = Context::full(&rt).map_err(err)?;
        ctx.with(|ctx| -> Result<(), String> {
            let p = Module::evaluate(ctx.clone(), "tray_alerts.js", DRIVER).map_err(|e| caught(&ctx, e))?;
            p.finish::<()>().map_err(|e| caught(&ctx, e))
        })?;
        Ok(Engine { rt, ctx })
    }

    /// Calls fc.<name>(...) in the driver, which always answers with JSON text.
    fn call(&self, name: &str, text: Option<&str>, now: f64) -> Result<String, String> {
        let out = self.ctx.with(|ctx| -> Result<String, String> {
            let fc: Object = ctx.globals().get("fc").map_err(|e| caught(&ctx, e))?;
            let f: Function = fc.get(name).map_err(|e| caught(&ctx, e))?;
            match text {
                Some(t) => f.call((t, now)),
                None => f.call((now,)),
            }
            .map_err(|e| caught(&ctx, e))
        });
        self.rt.run_gc();
        out
    }

    /// The alert choices the page sent (JSON). Returns the leagues they need, as JSON.
    pub fn prefs(&self, json: &str) -> Result<String, String> {
        self.call("prefs", Some(json), 0.0)
    }
    pub fn plan(&self, now: f64) -> Result<String, String> {
        self.call("plan", None, now)
    }
    pub fn boards(&self, json: &str, now: f64) -> Result<String, String> {
        self.call("boards", Some(json), now)
    }
    pub fn finish(&self, json: &str, now: f64) -> Result<String, String> {
        self.call("finish", Some(json), now)
    }
}

/// A thrown JavaScript error as text (the engine's own error only says "exception").
fn caught(ctx: &rquickjs::Ctx, e: rquickjs::Error) -> String {
    if let rquickjs::Error::Exception = e {
        let v = ctx.catch();
        if let Some(ex) = v.as_exception() {
            return format!("{} {}", ex.message().unwrap_or_default(), ex.stack().unwrap_or_default());
        }
        return format!("{v:?}");
    }
    e.to_string()
}
