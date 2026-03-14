from ortools.sat.python import cp_model

class PrecedenceOptimizer:
    def __init__(self, trains, track_capacity, objective='DELAY'):
        self.trains = trains
        self.track_capacity = track_capacity
        self.objective = objective
        self.model = cp_model.CpModel()

    def solve(self):
        """
        Real OR-Tools CP-SAT solver for train precedence on a single track segment.
        """
        starts = []
        ends = []
        intervals = []
        durations = []
        priority_weights = {'EXPRESS': 3, 'LOCAL': 2, 'FREIGHT': 1}
        
        for i, t in enumerate(self.trains):
            # Calculate duration in minutes
            speed = float(t.get('speed', 60.0))
            if speed <= 0: speed = 60.0
            duration = int(float(t.get('distance', 100)) / speed * 60)
            durations.append(duration)
            
            # Start and End times
            scheduled_arrival = int(t.get('scheduled_arrival', 0))
            # upper bound: 48 hours for schedule
            start = self.model.NewIntVar(scheduled_arrival, 2880, f'start_{i}')
            end = self.model.NewIntVar(scheduled_arrival + duration, 2880, f'end_{i}')
            interval = self.model.NewIntervalVar(start, duration, end, f'interval_{i}')
            
            starts.append(start)
            ends.append(end)
            intervals.append(interval)

        # Constraint: Track capacity (NoOverlap if capacity is 1)
        if self.track_capacity == 1:
            self.model.AddNoOverlap(intervals)

        # Objective: minimize weighted sum of delays
        delay_vars = []
        for i, t in enumerate(self.trains):
            scheduled_arrival = int(t.get('scheduled_arrival', 0))
            
            # Delay is difference between scheduled arrival and actual start time
            delay = self.model.NewIntVar(0, 2880, f'delay_{i}')
            self.model.Add(delay == starts[i] - scheduled_arrival)
            
            priority_str = str(t.get('priority', 'FREIGHT')).upper()
            weight = priority_weights.get(priority_str, 1)
            
            weighted_delay = self.model.NewIntVar(0, 2880 * 10, f'weighted_delay_{i}')
            self.model.Add(weighted_delay == delay * weight)
            delay_vars.append(weighted_delay)
            
        # Minimize sum of all weighted delays
        self.model.Minimize(sum(delay_vars))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        status = solver.Solve(self.model)
        
        status_name = solver.StatusName(status)
        
        schedule = []
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            for i, t in enumerate(self.trains):
                start_val = solver.Value(starts[i])
                end_val = solver.Value(ends[i])
                delay_val = start_val - int(t.get('scheduled_arrival', 0))
                
                # Explanation string
                if delay_val == 0:
                    action = "Clear path — proceed immediately"
                else:
                    action = f"Hold for {delay_val}m, then proceed"
                    
                schedule.append({
                    "train": t['id'],
                    "start": start_val,
                    "end": end_val,
                    "delay_minutes": delay_val,
                    "action": action
                })
        
        # Sort schedule by start time chronologically
        schedule.sort(key=lambda x: x['start'])
                
        return {
            "status": status_name,
            "schedule": schedule
        }
