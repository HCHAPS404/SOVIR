//! Migration runner for the SOVIR control-plane PostgreSQL schema.
//!
//! Development/CI tool: applies, reverts or lists sqlx migrations under
//! `infra/postgres/migrations`. Requires DATABASE_URL. This is NOT a
//! production deployment tool and does not grant RLS policies by itself.
use sqlx::migrate::Migrator;
use sqlx::postgres::PgPoolOptions;
use std::{env, path::PathBuf, time::Duration};

fn usage() -> &'static str {
    "usage: sovir-migrations <apply|revert|status> [migrations_dir]\n\
     env:   DATABASE_URL (required), defaults dir to infra/postgres/migrations"
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let command = args.next().unwrap_or_default();
    let dir = PathBuf::from(
        args.next()
            .unwrap_or_else(|| "infra/postgres/migrations".into()),
    );
    if !matches!(command.as_str(), "apply" | "revert" | "status") {
        return Err(usage().into());
    }
    let url = env::var("DATABASE_URL").map_err(|_| "set DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(15))
        .connect(&url)
        .await?;
    let migrator = Migrator::new(dir.clone()).await?;
    match command.as_str() {
        "apply" => {
            migrator.run(&pool).await?;
            println!("PASS: migrations applied from {}", dir.display());
        }
        "revert" => {
            // undo(pool, 0) rolls back every applied reversible migration.
            migrator.undo(&pool, 0).await?;
            println!("PASS: all applied migrations reverted");
        }
        _ => {
            for migration in migrator.iter() {
                let kind = match migration.migration_type {
                    sqlx::migrate::MigrationType::ReversibleUp => "reversible",
                    sqlx::migrate::MigrationType::ReversibleDown => "down-only",
                    _ => "one-way",
                };
                println!(
                    "{:>6} {:<32} {}",
                    migration.version, migration.description, kind
                );
            }
        }
    }
    Ok(())
}
