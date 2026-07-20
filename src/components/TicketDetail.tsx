import React from 'react';
import { Ticket } from '../types/ticket';
import { BusBoardingPass } from './passes/BusBoardingPass';
import { FlightBoardingPass } from './passes/FlightBoardingPass';
import { TrainBoardingPass } from './passes/TrainBoardingPass';

type Props = {
  ticket: Ticket;
  onBack?: () => void;
  onMenu?: () => void;
  embedded?: boolean;
};

/** Full ticket pass UI — train/bus/flight boarding passes. */
export function TicketPass({ ticket, onBack, onMenu, embedded }: Props) {
  if (ticket.kind === 'rail') {
    return (
      <TrainBoardingPass
        ticket={ticket}
        onBack={onBack}
        onMenu={onMenu}
        embedded={embedded}
      />
    );
  }
  if (ticket.kind === 'bus') {
    return (
      <BusBoardingPass
        ticket={ticket}
        onBack={onBack}
        onMenu={onMenu}
        embedded={embedded}
      />
    );
  }
  return (
    <FlightBoardingPass
      ticket={ticket}
      onBack={onBack}
      onMenu={onMenu}
      embedded={embedded}
    />
  );
}

export function TicketHero({ ticket }: Props) {
  return <TicketPass ticket={ticket} embedded />;
}

export function TicketDetailsPanel(_props: Props) {
  return null;
}
