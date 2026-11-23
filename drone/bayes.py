"""Topic 2 — Probabilistic reasoning: Bayesian inference.

Question answered: "How likely is a STRONG WIND right now, given one sensor reading?"

Hidden variable  W in {strong, calm}
Evidence         E in {alert, no_alert}  (one noisy wind sensor)

Bayes' rule:
    P(strong | e) = P(e | strong) * P(strong) / P(e)
    P(e) = P(e | strong) * P(strong) + P(e | calm) * P(calm)      (total probability)
"""

from dataclasses import dataclass, field


@dataclass
class BayesResult:
    prior: float                 # P(strong)
    observation: str             # "alert" or "no_alert"
    likelihood_strong: float     # P(e | strong)
    likelihood_calm: float       # P(e | calm)
    evidence: float              # P(e)
    posterior: float             # P(strong | e)
    steps: list = field(default_factory=list)


def wind_posterior(prior_strong: float,
                   alert: bool,
                   p_alert_given_strong: float = 0.8,
                   p_alert_given_calm: float = 0.2) -> BayesResult:
    """Update the probability of strong wind after ONE sensor reading.

    prior_strong          P(strong wind) before the reading
    alert                 True if the sensor raised an alert, False otherwise
    p_alert_given_strong  sensor hit rate          P(alert | strong)
    p_alert_given_calm    sensor false-alarm rate  P(alert | calm)
    """
    for name, p in [("prior_strong", prior_strong),
                    ("p_alert_given_strong", p_alert_given_strong),
                    ("p_alert_given_calm", p_alert_given_calm)]:
        if not 0.0 <= p <= 1.0:
            raise ValueError(f"{name} must be in [0, 1], got {p}")

    prior_calm = 1.0 - prior_strong

    if alert:
        obs = "alert"
        l_strong = p_alert_given_strong
        l_calm = p_alert_given_calm
    else:
        obs = "no_alert"
        l_strong = 1.0 - p_alert_given_strong
        l_calm = 1.0 - p_alert_given_calm

    joint_strong = l_strong * prior_strong
    joint_calm = l_calm * prior_calm
    evidence = joint_strong + joint_calm

    if evidence == 0:
        raise ValueError("P(evidence) = 0: this observation is impossible under the model")

    posterior = joint_strong / evidence

    steps = [
        f"Prior:       P(strong) = {prior_strong:.3f},  P(calm) = {prior_calm:.3f}",
        f"Observation: {obs}",
        f"Likelihood:  P({obs}|strong) = {l_strong:.3f},  P({obs}|calm) = {l_calm:.3f}",
        f"Joint:       P({obs},strong) = {l_strong:.3f}*{prior_strong:.3f} = {joint_strong:.4f}",
        f"             P({obs},calm)   = {l_calm:.3f}*{prior_calm:.3f} = {joint_calm:.4f}",
        f"Evidence:    P({obs}) = {joint_strong:.4f} + {joint_calm:.4f} = {evidence:.4f}",
        f"Posterior:   P(strong|{obs}) = {joint_strong:.4f} / {evidence:.4f} = {posterior:.4f}",
    ]

    return BayesResult(prior_strong, obs, l_strong, l_calm, evidence, posterior, steps)
