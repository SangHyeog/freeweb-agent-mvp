from dotenv import load_dotenv
from app.agent.core.orchestrator import SimpleAgentOrchestrator

load_dotenv()
orch = SimpleAgentOrchestrator()

result = orch.run(
    project_id = "hello-node",
    run_id="test_run_001"
)

print(result)