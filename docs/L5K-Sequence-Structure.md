# L5K Sequence Structure (Melter1.L5K Reference)

This document summarizes how sequences are implemented in the sample Rockwell Studio 5000 L5K file.

---

## 1. AOI_Sequence — The Core Step Controller

**Location:** `ADD_ON_INSTRUCTION_DEFINITION AOI_Sequence` (lines ~1901–2371)

A reusable Add-On Instruction that implements PackML-style sequence step control. Each sequence program instantiates one `AOI_Sequence` tag (e.g. `Sequence : AOI_Sequence`).

### Key Parameters

| Parameter       | Type | Usage  | Description                                      |
|-----------------|------|--------|--------------------------------------------------|
| `Step_Current`  | DINT | Output | Actual step index (0, 10, 20, 30, …)             |
| `Step_Next`     | DINT | Input  | Requested next step (program writes this)        |
| `Step_Previous` | DINT | Output | Previous step (for change detection)             |
| `STS_Running`   | BOOL | Output | Sequence is running (Step_Current = 20)          |
| `STS_Stopped`   | BOOL | Output | Sequence is stopped (Step_Current ≤ 10)          |
| `STS_Complete`  | BOOL | Input  | Program sets when step 30 reached                |
| `STS_Starting`  | BOOL | Output | Transitioning to running                         |
| `STS_Stopping`  | BOOL | Output | Transitioning to stopped                         |
| `STS_Paused`    | BOOL | Output | Paused by operator                               |
| `Start_Req`     | BOOL | Input  | Request to start                                 |
| `Stop_Req`      | BOOL | Input  | Request to stop                                   |
| `Call_Req`      | BOOL | Input  | Sequence called from another sequence            |
| `StepTime_Req`  | BOOL | Input  | Start step timer                                  |
| `StepTime_Done` | BOOL | Output | Step timer elapsed                               |

### Step Number Convention (AgitatorSeq example)

- **0** — Idle, waiting for pre-conditions  
- **10** — Waiting for start request  
- **20** — Running (main work step)  
- **30** — Complete  

Other sequences may use different step numbers; the convention is program-defined.

---

## 2. PROGRAM Structure — Sequence Containers

**Location:** `PROGRAM <Name> (MAIN := "_0000_MainRoutine", …)` (lines 3604+)

Each sequence is a **PROGRAM** with:

- **MAIN routine** — Entry point (e.g. `_0000_MainRoutine`)
- **TAG** block — Program-scoped tags, including the `AOI_Sequence` instance
- **ROUTINE** blocks — Logic split into subroutines called via `JSR`

### Example: AgitatorSeq (lines 3604–3748)

```
PROGRAM AgitatorSeq (MAIN := "_0000_MainRoutine", …)
  TAG
    Sequence : AOI_Sequence (Usage := Public) := [134754379,0,0,0,0,20,...];
    AG001_Req : BOOL;  // Output to agitator
    ...
  END_TAG

  ROUTINE _0000_MainRoutine
    JSR(_0100_1_Sequence_Control,0);
    JSR(_0100_2_Sequence_Steps,0);
    JSR(_0100_3_Sequence_Outputs,0);
    JSR(_0200_3WS_GelMelt,0);
  END_ROUTINE

  ROUTINE _0100_1_Sequence_Control   // Interlocks, Start/Stop/Pause logic
    AOI_Sequence(Sequence);
    ...
  END_ROUTINE

  ROUTINE _0100_2_Sequence_Steps   // Step transitions (Step_Next logic)
    EQU(Sequence.Step_Current,0) XIC(Sequence.STS_PreCond) MOV(10,Sequence.Step_Next);
    EQU(Sequence.Step_Current,10) XIC(Sequence.Start_Req) MOV(20,Sequence.Step_Next);
    EQU(Sequence.Step_Current,20) XIC(Sequence.Stop_Req) MOV(30,Sequence.Step_Next);
    EQU(Sequence.Step_Current,30) XIC(Sequence.STS_Complete) CLR(Sequence.Step_Next);
  END_ROUTINE

  ROUTINE _0100_3_Sequence_Outputs  // Physical outputs per step
    EQU(Sequence.Step_Current,20) XIO(Sequence.STS_Paused) OTE(AG001_Req);
  END_ROUTINE
```

---

## 3. Routine Naming Convention

| Pattern        | Purpose                                      |
|----------------|----------------------------------------------|
| `_0000_MainRoutine` | Main entry, calls subroutines via JSR   |
| `_0100_1_Sequence_Control` | AOI_Sequence call + interlocks + Start/Stop/Pause |
| `_0100_2_Sequence_Steps`   | Step transition logic (MOV Step_Next)     |
| `_0100_3_Sequence_Outputs`| Outputs driven by Step_Current            |
| `_0200_*`                  | Optional sub-logic (e.g. 3WS messaging)   |

---

## 4. Sequence Programs in Melter1.L5K

| Program          | Purpose (inferred)     |
|------------------|------------------------|
| MainProgram      | Top-level coordinator  |
| AgitatorSeq      | Agitator sequence      |
| RecipeSeq        | Recipe sequence        |
| CIPSeq           | CIP sequence           |
| DischargeSeq      | Discharge sequence     |
| TopAdditionSeq   | Top addition           |
| BottomAdditionSeq| Bottom addition        |
| GelatinSeq       | Gelatin sequence       |
| GlycerinSeq      | Glycerin sequence      |
| HeatingSeq       | Heating sequence       |
| DeAerationSeq    | De-aeration            |
| ROWaterSeq       | RO water               |
| TownWaterSeq     | Town water             |
| VacuumSeq        | Vacuum sequence        |
| SampleSeq        | Sampling               |
| Devices          | Device I/O / interlocks |
| Ignition         | SCADA / Ignition       |
| ClockPulse       | Utility timing          |
| CV001            | Control valve           |

---

## 5. Cross-Sequence Dependencies

Sequences reference each other via `Call_Req` and status checks:

```logix
// AgitatorSeq checks if RecipeSeq or CIPSeq is running before allowing stop
XIO(\RecipeSeq.Sequence.STS_Running) XIO(\CIPSeq.Sequence.STS_Running) XIC(Sequence.STS_Running) OTE(Sequence.Stop_EN);

// Start pre-condition: RecipeSeq and CIPSeq must be stopped
XIC(\RecipeSeq.Sequence.STS_Stopped) XIC(\CIPSeq.Sequence.STS_Stopped) XIC(Sequence.STS_Stopped) ...

// Call_Req: AgitatorSeq is "called" by other sequences
[XIC(\RecipeSeq.Agitator_m1_Call) , XIC(\CIPSeq.AgitatorSeq_Call) , ... ] OTE(Sequence.Call_Req);
```

---

## 6. Parsing Hints for Future L5K Integration

To extract sequence flow from L5K:

1. **PROGRAM** blocks — Identify sequence programs by `PROGRAM <Name> (MAIN := ...)`.
2. **AOI_Sequence instance** — Look for `Sequence : AOI_Sequence` (or similar) in each program's TAG block.
3. **Step transitions** — In `_0100_2_Sequence_Steps` (or equivalent), parse `MOV(<step>, Sequence.Step_Next)` and conditions (`EQU(Sequence.Step_Current, <n>)`, `XIC(...)`).
4. **Outputs** — In `_0100_3_Sequence_Outputs`, parse `EQU(Sequence.Step_Current, <n>)` and `OTE(...)` to map steps to outputs.
5. **RC comments** — `RC: "..."` lines often describe step/block purpose.
6. **Cross-references** — Search for `\ProgramName.Sequence.STS_*` or `\ProgramName.CallTag` to build a dependency graph.

---

## 7. Step Number Ranges (Typical)

- **0** — Idle / reset
- **10** — Pre-start / waiting for start
- **20** — Running (main work)
- **30** — Complete
- **9000–9101** — HMI status codes (paused, fault, etc.)
