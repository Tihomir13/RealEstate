import { Pipe, PipeTransform } from '@angular/core';
import {
  fmt1,
  fmt2,
  fmtBgn,
  fmtEur,
  fmtEurPerM2,
  fmtInt,
  fmtPct,
  fmtPeriod,
} from '../core/i18n/labels';

@Pipe({ name: 'bgInt' })
export class BgIntPipe implements PipeTransform {
  transform = fmtInt;
}

@Pipe({ name: 'bg1' })
export class Bg1Pipe implements PipeTransform {
  transform = fmt1;
}

@Pipe({ name: 'bg2' })
export class Bg2Pipe implements PipeTransform {
  transform = fmt2;
}

@Pipe({ name: 'eur' })
export class EurPipe implements PipeTransform {
  transform = fmtEur;
}

@Pipe({ name: 'eurM2' })
export class EurM2Pipe implements PipeTransform {
  transform = fmtEurPerM2;
}

@Pipe({ name: 'bgn' })
export class BgnPipe implements PipeTransform {
  transform = fmtBgn;
}

@Pipe({ name: 'pct' })
export class PctPipe implements PipeTransform {
  transform(value: number | null | undefined, sign = true): string {
    return fmtPct(value, sign);
  }
}

@Pipe({ name: 'period' })
export class PeriodPipe implements PipeTransform {
  transform = fmtPeriod;
}

export const FORMAT_PIPES = [
  BgIntPipe,
  Bg1Pipe,
  Bg2Pipe,
  EurPipe,
  EurM2Pipe,
  BgnPipe,
  PctPipe,
  PeriodPipe,
] as const;
