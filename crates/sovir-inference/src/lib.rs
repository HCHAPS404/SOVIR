//! Local-first inference budget guard. No network clients in this crate.
use std::{collections::HashMap, sync::Mutex};
use thiserror::Error;

#[derive(Debug, Clone, Copy)]
pub struct CostPolicy {
    pub max_calls_per_day: u32,
    pub max_usd_micros_per_day: u64,
    pub max_usd_micros_per_request: u64,
}
#[derive(Debug, Clone, Copy, Default)]
struct Consumption {
    calls: u32,
    reserved_usd_micros: u64,
}
#[derive(Default)]
pub struct BudgetGovernor {
    ledger: Mutex<HashMap<(String, u64), Consumption>>,
}
#[derive(Debug, Error, PartialEq, Eq)]
pub enum BudgetError {
    #[error("inference disabled or exceeds configured hard limits")]
    LimitExceeded,
    #[error("budget ledger unavailable")]
    Unavailable,
}
impl BudgetGovernor {
    /// Atomic reservation before dispatching any external request.
    /// day is a UTC day ordinal produced by the trusted backend clock.
    pub fn reserve(
        &self,
        account: &str,
        day: u64,
        estimated_usd_micros: u64,
        policy: CostPolicy,
    ) -> Result<(), BudgetError> {
        if account.trim().is_empty() || estimated_usd_micros > policy.max_usd_micros_per_request {
            return Err(BudgetError::LimitExceeded);
        }
        let mut ledger = self.ledger.lock().map_err(|_| BudgetError::Unavailable)?;
        let current = ledger.entry((account.to_owned(), day)).or_default();
        let next_calls = current
            .calls
            .checked_add(1)
            .ok_or(BudgetError::LimitExceeded)?;
        let next_cost = current
            .reserved_usd_micros
            .checked_add(estimated_usd_micros)
            .ok_or(BudgetError::LimitExceeded)?;
        if next_calls > policy.max_calls_per_day || next_cost > policy.max_usd_micros_per_day {
            return Err(BudgetError::LimitExceeded);
        }
        current.calls = next_calls;
        current.reserved_usd_micros = next_cost;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn governor_prevents_third_request() {
        let b = BudgetGovernor::default();
        let p = CostPolicy {
            max_calls_per_day: 2,
            max_usd_micros_per_day: 200,
            max_usd_micros_per_request: 100,
        };
        assert!(b.reserve("test", 42, 75, p).is_ok());
        assert!(b.reserve("test", 42, 75, p).is_ok());
        assert_eq!(b.reserve("test", 42, 1, p), Err(BudgetError::LimitExceeded));
    }
    #[test]
    fn zero_budget_means_no_paid_requests() {
        let b = BudgetGovernor::default();
        let p = CostPolicy {
            max_calls_per_day: 0,
            max_usd_micros_per_day: 0,
            max_usd_micros_per_request: 0,
        };
        assert_eq!(b.reserve("test", 42, 0, p), Err(BudgetError::LimitExceeded));
    }
}
