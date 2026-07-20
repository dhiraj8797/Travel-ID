import { parseBusTicket } from "../src/parsers/ticketText";
import { processQrValue } from "../src/parsers/qrPipeline";

const sample = `scapia BUS TICKET PNR SNSQ7HJWD779 Operator SNS Holidays Bus Type A/C Sleeper (2+1) From Shimoga To Bangalore Boarding Point Shivamogga Bus Stand Dropping Point GPR Travels Departure 23:25 Reporting Time 23:10 Arrival 05:00 Duration 5h 35m Passenger Name Dhiraj Kumar Seat U9 Status Confirmed`;
const d = parseBusTicket(sample);
console.log("pdf", { pnr: d.pnr, op: d.operator, platform: d.bookingPlatform, from: d.from, board: d.boardingPoint, report: d.reportingTime, seat: d.passengers[0]?.seat, type: d.classType });
const qr = processQrValue("type=bus&pnr=SNSQ7HJWD779&operator=SNS Holidays&platform=Scapia&from=Shimoga&to=Bangalore&boarding=Shivamogga Bus Stand&dropping=GPR Travels&date=18 Jul 2026&time=23:25&report=23:10&arrtime=05:00&class=A/C Sleeper (2+1)&name=Dhiraj Kumar&seat=U9");
console.log("qr", { board: qr.boardingPoint, report: qr.reportingTime, seat: qr.passengers[0]?.seat, name: qr.passengers[0]?.name });
