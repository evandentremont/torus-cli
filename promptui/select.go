package promptui

import (
	"bytes"
	"io"
	"os"
	"strings"

	"github.com/chzyer/readline"
)

// SelectedAdd is returned from SelectWithAdd when add is selected.
const SelectedAdd = -1

// Select represents a list for selecting a single item
type Select struct {
	Label string   // Label is the value displayed on the command line prompt.
	Items []string // Items are the items to use in the list.
}

// Run runs the Select list. It returns the index of the selected element,
// and its value.
func (s *Select) Run() (int, string, error) {
	return s.innerRun(0, ' ')
}

func (s *Select) innerRun(starting int, top rune) (int, string, error) {
	stdin := readline.NewCancelableStdin()
	c := &readline.Config{}
	err := c.Init()
	if err != nil {
		return 0, "", err
	}

	c.Stdin = stdin

	prompt := s.Label + ": "

	c.HistoryLimit = -1
	c.UniqueEditLine = true

	start := 0
	end := 4

	if len(s.Items) <= end {
		end = len(s.Items) - 1
	}

	selected := starting

	rl, err := readline.NewEx(c)
	if err != nil {
		return 0, "", err
	}

	rl.Write([]byte(hideCursor))
	rl.Write([]byte(strings.Repeat("\n", end-start+1)))

	counter := 0

	c.SetListener(func(line []rune, pos int, key rune) ([]rune, int, bool) {
		switch key {
		case readline.CharEnter:
			return nil, 0, true
		case readline.CharNext:
			switch selected {
			case len(s.Items) - 1:
			case end:
				start++
				end++
				fallthrough
			default:
				selected++
			}
		case readline.CharPrev:
			switch selected {
			case 0:
			case start:
				start--
				end--
				fallthrough
			default:
				selected--
			}
		}

		list := make([]string, end-start+1)
		for i := start; i <= end; i++ {
			page := ' '
			selection := " "
			item := s.Items[i]

			switch i {
			case 0:
				page = top
			case len(s.Items) - 1:
			case start:
				page = '↑'
			case end:
				page = '↓'
			}
			if i == selected {
				selection = "☞"
				item = underlined(item)
			}
			list[i-start] = clearLine + "\r" + string(page) + selection + " " + item
		}

		prefix := ""
		prefix += upLine(uint(len(list))) + "\r" + clearLine
		p := prefix + bold(iconInitial) + " " + bold(prompt) + downLine(1) + strings.Join(list, downLine(1))
		rl.SetPrompt(p)
		rl.Refresh()

		counter++

		return nil, 0, true
	})

	_, err = rl.Readline()
	rl.Close()

	if err != nil {
		switch {
		case err == readline.ErrInterrupt, err.Error() == "Interrupt":
			err = ErrInterrupt
		case err == io.EOF:
			err = ErrEOF
		}

		rl.Write([]byte("\n"))
		rl.Write([]byte(showCursor))
		rl.Refresh()
		return 0, "", err
	}

	rl.Write(bytes.Repeat([]byte(clearLine+upLine(1)), end-start+1))
	rl.Write([]byte("\r"))

	out := s.Items[selected]
	rl.Write([]byte(iconGood + " " + prompt + faint(out) + "\n"))

	rl.Write([]byte(showCursor))
	return selected, out, err
}

// SelectWithAdd represents a list for selecting a single item, or selecting
// a newly created item.
type SelectWithAdd struct {
	Label string   // Label is the value displayed on the command line prompt.
	Items []string // Items are the items to use in the list.

	AddLabel string // The label used in the item list for creating a new item.

	// Validate is optional. If set, this function is used to validate the input
	// after each character entry.
	Validate ValidateFunc
}

// Run runs the Select list. It returns the index of the selected element,
// and its value. If a new element is created, -1 is returned as the index.
func (sa *SelectWithAdd) Run() (int, string, error) {
	if len(sa.Items) > 0 {
		newItems := append([]string{sa.AddLabel}, sa.Items...)

		s := Select{
			Label: sa.Label,
			Items: newItems,
		}

		selected, value, err := s.innerRun(1, '+')
		if err != nil || selected != 0 {
			return selected - 1, value, err
		}

		// XXX run through terminal for windows
		os.Stdout.Write([]byte(upLine(1) + "\r" + clearLine))
	}

	p := Prompt{
		Label:    sa.AddLabel,
		Validate: sa.Validate,
	}
	value, err := p.Run()
	return SelectedAdd, value, err
}
